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

## Secours Supabase — TEMPORAIRE, conservé volontairement

Le client essaie d'abord `/api/contact`. Si le service est absent ou non configuré (404/405/502/503, ou réseau), il retombe
sur l'ancien INSERT anonyme dans `contact_messages`. Il est conservé car, tant que Resend n'est pas configuré, le retirer
laisserait un formulaire qui échoue toujours. **Ce n'est pas l'architecture finale.**

### Checklist de suppression (à faire après activation de Resend, dans cet ordre)

1. Configurer `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` dans Vercel (Production + Preview) et redéployer.
2. Vérifier un envoi réel de bout en bout (message de test identifiable) : `/api/contact` doit répondre 200.
3. Retirer le secours dans le code — repérer les 3 blocs par `grep -rn LEGACY-SUPABASE-FALLBACK apps/landing/src` :
   (1/3) `sendContact` dans `src/lib/contact.ts` ; (2/3) `supabaseUrl`/`anonKey`/`legacyEnabled` et `data-endpoint`/`data-key` dans
   `src/pages/contact.astro` ; (3/3) la branche `outcome === "unavailable"` du script (la remplacer par un `throw`).
   Retirer ensuite `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` de `.env.example` s'ils ne servent plus à rien, et mettre à jour
   la page /confidentialite/ (le flux n'est plus « base Supabase » mais « e-mail via Resend »).
4. **Seulement après** : migration Supabase séparée supprimant la policy `contact_insert` (migration 0005, `with check (true)`).
   Ne PAS la supprimer avant l'étape 3, sinon le secours échouerait en production.

## À traiter séparément (hors de ce périmètre)

1. **Supabase** : voir l'étape 4 de la checklist ci-dessus (migration séparée, après retrait du secours client).
   Si l'on veut garder une trace en base : insertion depuis la fonction avec `SUPABASE_SERVICE_ROLE_KEY` (variable serveur).
2. **Limitation de débit** : impossible de façon fiable avec des fonctions sans état. Utiliser une règle « Rate limiting »
   du pare-feu Vercel sur `POST /api/contact` (configuration dans le dashboard) ou un stockage partagé (Vercel KV / Upstash).
3. **Mentions de confidentialité** : la page /confidentialite/ décrit aujourd'hui un enregistrement dans Supabase ; à mettre
   à jour (et durée de conservation) quand le flux Resend devient le flux principal.
