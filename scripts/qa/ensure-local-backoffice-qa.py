#!/usr/bin/env python3
"""
Garantit, de façon idempotente, que le compte QA du back-office
("test.admin-3b2@toboggo.local", membership gestionnaire sur Ville de Lyon)
existe et fonctionne sur Supabase LOCAL — quel que soit l'état de départ.

Pourquoi ce script : plusieurs sessions/process travaillent en parallèle sur
le même Supabase local et réinitialisaient chacune ce mot de passe à partir
de leur propre mémoire, produisant une course (le compte "cessait de
fonctionner" de façon récurrente — voir mémoire projet COLL-02F). Ce script
remplace ces resets ad hoc : son résultat est toujours le même, quel que
soit le nombre de fois ou le nombre de sessions qui le relancent.

NE JAMAIS appeler ce script automatiquement (pas de hook npm "dev"/"start",
pas de postinstall). Il se lance explicitement, à la demande :

    python3 scripts/qa/ensure-local-backoffice-qa.py [--dry-run]

Mot de passe : jamais en dur ici, jamais dans un fichier suivi. Il vient
uniquement de QA_LOCAL_PASSWORD dans `.env.local` (gitignored) à la racine
du repo — ajoutez-y une ligne telle que :

    QA_LOCAL_PASSWORD=UnMotDePasseLocalAuChoix
"""

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[2]

QA_EMAIL = "test.admin-3b2@toboggo.local"
QA_NAME = "Test QA (COLL back-office)"
LYON_ORG_ID = "00000000-0000-0000-0000-000000000001"
LYON_ROLE = "gestionnaire"

# Sécurité absolue : cette DSN est fixe et ne peut jamais pointer ailleurs
# qu'en local — même pattern que scripts/osm/import-osm-local.py. Le script
# ne lit jamais VITE_SUPABASE_URL ni aucune variable d'environnement pour
# décider de sa cible : la cible est toujours 127.0.0.1.
DB_DSN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
if "127.0.0.1:54322" not in DB_DSN:
    raise RuntimeError("SECURITY: ce script n'est autorisé que sur Supabase LOCAL")


def parse_args():
    p = argparse.ArgumentParser(description="Prépare/vérifie le compte QA back-office (LOCAL uniquement).")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="N'écrit rien : affiche l'état actuel et les actions qui seraient effectuées.",
    )
    return p.parse_args()


def fail(message):
    print(f"ERREUR : {message}", file=sys.stderr)
    sys.exit(1)


def supabase_status():
    try:
        out = subprocess.run(
            ["supabase", "status", "-o", "json"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        fail(f"impossible d'interroger `supabase status` ({e}). Supabase local est-il démarré (`supabase start`) ?")
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        fail("réponse inattendue de `supabase status -o json`.")


def assert_local_only(status):
    """Refuse explicitement staging / prod / tout projet lié — avant toute écriture."""
    api_url = status.get("API_URL", "")
    linked = status.get("linked_project")
    if not (api_url.startswith("http://127.0.0.1") or api_url.startswith("http://localhost")):
        fail(f"API_URL='{api_url}' n'est pas l'instance locale. Abandon (staging/production refusés).")
    if linked:
        fail(f"Un projet Supabase est lié (linked_project={linked!r}). Abandon : ce script est LOCAL uniquement.")
    return api_url


def read_env_local(key):
    """Lecture minimale, sans dépendance externe, de `.env.local` (gitignored)."""
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        if k.strip() == key:
            return v.strip().strip('"').strip("'")
    return None


def admin_request(api_url, service_key, method, path, payload=None):
    url = f"{api_url}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", service_key)
    req.add_header("Authorization", f"Bearer {service_key}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
            return resp.status, (json.loads(body) if body else {})
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, {"raw": body.decode("utf-8", "replace")}


def try_login(api_url, anon_key, email, password):
    status, body = admin_request(
        api_url, anon_key, "POST", "/auth/v1/token?grant_type=password", {"email": email, "password": password}
    )
    return status == 200 and "access_token" in body


def main():
    args = parse_args()

    status = supabase_status()
    api_url = assert_local_only(status)
    service_key = status["SERVICE_ROLE_KEY"]
    anon_key = status["ANON_KEY"]

    password = read_env_local("QA_LOCAL_PASSWORD")
    if not password:
        fail(
            "QA_LOCAL_PASSWORD absent de .env.local. Ajoutez par ex. :\n"
            "  QA_LOCAL_PASSWORD=UnMotDePasseLocalAuChoix\n"
            "dans .env.local (gitignored, jamais commité)."
        )

    print("ENVIRONMENT : LOCAL (", api_url, ")")
    print("Mode        :", "DRY RUN (aucune écriture)" if args.dry_run else "APPLY")
    print()

    conn = psycopg.connect(DB_DSN)
    conn.autocommit = True

    # ── 1. Utilisateur Auth ─────────────────────────────────────────────
    with conn.cursor() as cur:
        cur.execute("select id, email_confirmed_at from auth.users where email = %s", (QA_EMAIL,))
        row = cur.fetchone()

    if row is None:
        print(f"Utilisateur absent ({QA_EMAIL}) → création" + (" [dry-run: ignoré]" if args.dry_run else ""))
        if not args.dry_run:
            s, body = admin_request(
                api_url,
                service_key,
                "POST",
                "/auth/v1/admin/users",
                {"email": QA_EMAIL, "password": password, "email_confirm": True},
            )
            if s not in (200, 201):
                fail(f"création de l'utilisateur échouée ({s}): {body}")
        with conn.cursor() as cur:
            cur.execute("select id, email_confirmed_at from auth.users where email = %s", (QA_EMAIL,))
            row = cur.fetchone()
            if row is None and args.dry_run:
                row = (None, None)
    else:
        print(f"Utilisateur présent ({QA_EMAIL}) → conservé")

    user_id, email_confirmed_at = row

    if user_id and email_confirmed_at is None:
        print("E-mail non confirmé → confirmation" + (" [dry-run: ignoré]" if args.dry_run else ""))
        if not args.dry_run:
            s, body = admin_request(api_url, service_key, "PUT", f"/auth/v1/admin/users/{user_id}", {"email_confirm": True})
            if s != 200:
                fail(f"confirmation de l'e-mail échouée ({s}): {body}")
    elif user_id:
        print("E-mail déjà confirmé")

    # ── 2. Mot de passe — ne reset que si nécessaire (silencieux sinon) ──
    if user_id:
        already_ok = try_login(api_url, anon_key, QA_EMAIL, password)
        if already_ok:
            print("Mot de passe déjà synchronisé avec QA_LOCAL_PASSWORD (aucun reset nécessaire)")
        else:
            print("Mot de passe désynchronisé → resynchronisation" + (" [dry-run: ignoré]" if args.dry_run else ""))
            if not args.dry_run:
                s, body = admin_request(api_url, service_key, "PUT", f"/auth/v1/admin/users/{user_id}", {"password": password})
                if s != 200:
                    fail(f"mise à jour du mot de passe échouée ({s}): {body}")

    # ── 3. Membership Ville de Lyon / gestionnaire ────────────────────────
    # `ON CONFLICT (organization_id, email)` : ne crée ni ne supprime aucune
    # AUTRE ligne de team_members (ex. la membership staff super_admin
    # existante reste intouchée — filtrée par organization_id = Lyon).
    if not args.dry_run and user_id:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into team_members (user_id, organization_id, name, email, role)
                values (%s, %s, %s, %s, %s)
                on conflict (organization_id, email)
                do update set user_id = excluded.user_id, role = excluded.role
                """,
                (user_id, LYON_ORG_ID, QA_NAME, QA_EMAIL, LYON_ROLE),
            )
    with conn.cursor() as cur:
        cur.execute(
            "select role from team_members where organization_id = %s and email = %s",
            (LYON_ORG_ID, QA_EMAIL),
        )
        membership = cur.fetchone()

    if membership is None:
        print(f"Membership Ville de Lyon : absente{' [dry-run: serait créée]' if args.dry_run else ''}")
        lyon_ok = False
    elif membership[0] != LYON_ROLE:
        print(f"Membership Ville de Lyon : rôle incorrect ({membership[0]}){' [dry-run: serait corrigé]' if args.dry_run else ''}")
        lyon_ok = False
    else:
        print(f"Membership Ville de Lyon : rôle '{LYON_ROLE}' confirmé")
        lyon_ok = True

    conn.close()

    # ── 4. Test d'authentification réel (lecture seule, aucun effet de
    # bord) + synthèse — toujours exécuté, même en --dry-run, puisqu'il ne
    # modifie rien : c'est la seule source de vérité sur l'état courant. ──
    login_ok = try_login(api_url, anon_key, QA_EMAIL, password) if user_id else False

    print()
    print(f"AUTH USER     : {'OK' if user_id else 'KO'}")
    print(f"PASSWORD      : {'synchronisé localement' if login_ok else 'KO' + (' (dry-run : pas de correction appliquée)' if args.dry_run else '')}")
    print(f"VILLE DE LYON : {'OK' if lyon_ok else 'KO'}")
    print(f"ENVIRONMENT   : LOCAL")

    if not args.dry_run and not (user_id and login_ok and lyon_ok):
        sys.exit(1)


if __name__ == "__main__":
    main()
