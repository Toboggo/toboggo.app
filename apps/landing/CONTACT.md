# Formulaire de contact — architecture et configuration

```
formulaire (/contact/)
  → POST /api/contact            Vercel Function (apps/landing/api/contact.ts)
  → validation serveur           src/lib/contactServer.ts (mêmes règles que le client : src/lib/contact.ts)
  → anti-spam                    honeypot `website` + délai minimal + contrôle d'Origin + taille max + JSON/POST uniquement
  → Resend (https://api.resend.com/emails), texte brut uniquement
  → boîte de réception           adresse lue dans l'environnement
```

## Variables d'environnement (Vercel → projet `toboggo-website` → Settings → Environment Variables, **serveur uniquement**)

| Variable | Rôle |
|---|---|
| `RESEND_API_KEY` | clé API Resend (jamais préfixée `PUBLIC_`, jamais dans le dépôt) |
| `CONTACT_TO_EMAIL` | adresse qui reçoit les messages |
| `CONTACT_FROM_EMAIL` | expéditeur, sur un domaine **vérifié dans Resend** (ex. `Toboggo <contact@…>`) |

Tant qu'une des trois manque, `/api/contact` répond `503 not_configured` sans rien envoyer.

## Comportement transitoire (secours)

Le client essaie d'abord `/api/contact`. Si le service est absent ou non configuré (404/405/502/503, ou réseau),
il retombe sur l'ancien INSERT anonyme dans `contact_messages` (Supabase). Rien n'est perdu pendant la transition.

## À traiter séparément (hors de ce périmètre)

1. **Supabase** : la policy `contact_insert … with check (true)` (migration 0005) autorise l'insertion publique ;
   elle ne peut pas être retirée sans migration. Une fois Resend en service : migration qui supprime cette policy
   (ou réserve l'insertion au `service_role`), puis retrait du secours côté client (`sendContact`, `data-endpoint`/`data-key`).
   Si l'on veut garder une trace en base : insertion depuis la fonction avec `SUPABASE_SERVICE_ROLE_KEY` (variable serveur).
2. **Limitation de débit** : impossible de façon fiable avec des fonctions sans état. Utiliser une règle « Rate limiting »
   du pare-feu Vercel sur `POST /api/contact` (configuration dans le dashboard) ou un stockage partagé (Vercel KV / Upstash).
3. **Mentions de confidentialité** : la page /confidentialite/ décrit aujourd'hui un enregistrement dans Supabase ; à mettre
   à jour (et durée de conservation) quand le flux Resend devient le flux principal.
