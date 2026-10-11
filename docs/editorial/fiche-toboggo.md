# Fiche Toboggo — contexte éditorial

> Fichier de connaissance du Projet Claude « Rédaction SEO Toboggo ».
> Sources : code et contenus du site (`apps/landing`), `IMPLEMENTATION.md`, `docs/DESIGN-SYSTEM.md` §2,
> `docs/Toboggo-Brand-Guidelines.pdf` (p. 2 et 9). État au **11 octobre 2026**.
> En cas de doute entre cette fiche et ce que dit l'équipe, l'équipe a raison : signale l'écart.

## 1. En une phrase

Toboggo aide les familles à trouver les aires de jeux adaptées à leurs enfants près de chez elles, et donne aux
collectivités un outil pour gérer leurs aires de jeux et traiter les signalements. **Une seule marque, deux publics.**

Promesse du site : « Trouvez le terrain de jeu qui leur correspond. »
Mission (à reprendre dans l'esprit, pas mot pour mot) : *connecter les familles et les mairies autour des aires de jeux.*

## 2. Pour qui on écrit

| Public | Besoin | Ce qu'on lui apporte |
|---|---|---|
| **Parents** (public principal des articles) | Trouver un parc ouvert, adapté à l'âge de leur enfant, sans source fiable. Parents pressés, souvent sur mobile. | Une réponse concrète et fiable, des critères clairs, un renvoi vers l'app quand c'est utile. |
| **Collectivités** (mairies, services espaces verts) | Gérer leur patrimoine ludique, recevoir et traiter les signalements. | Un outil dédié (espace collectivité), accès activé sur demande. |
| Grands-parents, assistantes maternelles, centres de loisirs | Idées de sorties, critères de choix. | Même ton, mêmes critères. |

Le blog vise d'abord le référencement naturel de **requêtes de parents** (choisir une aire de jeux, préparer une sortie,
critères par âge) et, plus rarement, de **décideurs en collectivité** (valoriser ses aires de jeux, traiter les signalements).

## 3. Positionnement et différenciation (ce qu'on peut affirmer)

- **8 critères famille** par fiche de parc : tranche d'âge, ombre, WC, clôture, accès PMR, bancs, eau potable, parking.
- **Honnêteté sur l'incertitude** : une information non confirmée est dite non confirmée, jamais présentée comme absente.
- **Double usage** : le même outil sert les familles (app) et les agents (espace collectivité).
- Les informations sur les parcs viennent de la **communauté**, des **collectivités partenaires** et de données ouvertes
  (OpenStreetMap) ; les contributions sont **vérifiées avant publication** (formulation du site).

## 4. Ce qui existe vraiment (vérifié dans le dépôt)

### Application des familles (web, installable)
- Carte interactive et liste des parcs proches ; **rayon de recherche réglable** ; recherche par ville ou par nom,
  **sans devoir autoriser la géolocalisation**.
- **Filtres** : âge + équipements (ombre, WC, clôture, accès PMR, bancs, eau potable, parking).
- **Fiche de parc** : équipements et services, photos, avis des familles, score détaillé.
- **Favoris** et **comparaison** de parcs.
- **Itinéraire** vers le parc (Plans, Google Maps, Waze) ; **partage** par WhatsApp ou lien copié.
- **Sortie de groupe** : partager sa présence sur un parc avec d'autres parents (code à 5 caractères).
- **Profils d'enfants** (prénom et âge) : jamais rendus publics ni partagés.
- Disponible en **français, anglais, espagnol**.
- **Contribuer** (compte gratuit) : ajouter un parc, donner un avis, signaler un problème (7 catégories : équipement
  cassé, sécurité, propreté, végétation, accessibilité, information erronée, autre), proposer des photos, corriger une
  information, suivre ses contributions.
- **Navigation sans compte** : la carte reste libre d'accès. **Création de compte gratuite.**
- Suppression du compte et des données possible depuis l'app ou par e-mail.

### Espace collectivité (accès sur demande, sans installation)
Tableau de bord d'action, gestion des parcs (fiche, création, historique des modifications), carte des parcs,
traitement des signalements (export CSV), avis des familles (consultation et réponse), photos modérées (validation ou
refus, photo de couverture), suivi de l'entretien, équipe et rôles (gestionnaire / contributeur), journal d'activité et
rapport mensuel PDF.

### Liens publics
- Site : `https://toboggo-website.vercel.app` (pas encore de nom de domaine personnalisé : ne jamais en inventer un).
- Application : `https://toboggo-app.vercel.app`.
- Contact : `contact@toboggo.app` ; données personnelles : `privacy@toboggo.app`.
- Pages utiles pour les liens internes : `/fonctionnalites/`, `/collectivites/`, `/faq/`, `/a-propos/`, `/contact/`,
  `/guides/` (liste du blog). Les chemins se terminent **toujours par `/`**.

## 5. Ce qui N'EXISTE PAS (ne jamais l'annoncer)

- **Applications App Store / Google Play** : non publiées. Écrire « application web » ou « l'app Toboggo », jamais
  « téléchargez sur l'App Store ».
- Filtre « Ouvert maintenant », connexion Google/Apple, mode sombre, notifications push : absents ou non branchés.
- Abonnements ou tarifs pour les collectivités : aucun tarif public. Ne pas parler de prix.
- Applications natives, application hors-ligne, messagerie entre utilisateurs, système de points ou « quêtes ».

## 6. Informations à ne JAMAIS inventer

- **Chiffres** : nombre de parcs, d'avis, d'utilisateurs, de villes, notes moyennes, parts de marché. Décision fondateur :
  les statistiques marketing (« 2 400+ parcs », « 18 000+ avis », « 4,8/5 ») sont **à retirer**, ne pas les reprendre.
  La couverture est **inégale selon les territoires** ; si un article a besoin d'un chiffre ou d'une zone couverte,
  demande-le à l'équipe.
- **Identité de l'entreprise** : raison sociale, adresse, capital, équipe, noms, dates de création, financement.
  Les mentions légales du site sont « à compléter » : n'utilise aucune de ces informations.
- **Clients et partenaires** : aucun nom de collectivité cliente, aucun témoignage, aucune citation d'utilisateur.
- **Données de parcs précis** (équipements, horaires, état) : ne les affirme que si elles proviennent d'une source que
  tu peux citer (fiche officielle de la commune, OpenStreetMap, etc.), jamais « de mémoire ».
- **Sécurité des enfants, normes, réglementation** : uniquement à partir de sources officielles citées (service-public.fr,
  Légifrance, DGCCRF…). Aucun conseil médical.
- **Fonctionnalités à venir** : aucune date, aucune promesse.
- **Pages locales** `/aires-de-jeux/<ville>/` : n'existent que pour quelques villes et peuvent être non indexées. Ne pas
  y renvoyer sans confirmation.

## 7. Ton et style

Source : guide de marque, « Ton & voix » — *rassurant, concret, jamais infantilisant.*

- **Vouvoiement**, adressé à des **parents pressés** qui veulent une réponse fiable. Jamais aux enfants.
- **Concret plutôt qu'abstrait** : dire ce qui est vérifié, quand, par qui. « Vérifié il y a 6 jours » plutôt que
  « mis à jour régulièrement ».
- **Honnête sur l'incertitude** : « information non confirmée » et non « absent ».
- **Chaleureux sans être puéril, précis sans être technique.** Pas de mascotte qui parle, pas de point d'exclamation en
  rafale, pas d'emoji, pas de jeu de mots enfantin. La chaleur vient de la forme, pas du ton.
- Côté collectivités : même sobriété. Des **signalements à traiter**, pas des « quêtes » ; vocabulaire d'agent
  (patrimoine, entretien, suivi), sans jargon administratif inutile.
- Vocabulaire : « aire de jeux » (terme principal), « parc », « terrain de jeu » ; « collectivité », « mairie » ;
  « signalement » ; « fiche de parc ». Toboggo s'écrit avec une majuscule, sans article (« Toboggo propose… »).
- Français de France, orthographe moderne, typographie française (espace avant `:`, `?`, `!`, `;` et guillemets « »).

## 8. Sujets prioritaires (idées d'articles déjà prévues par l'équipe)

1. Comment choisir une aire de jeux adaptée à l'âge de son enfant ?
2. Que regarder avant de choisir un parc avec de jeunes enfants ?
3. Préparer une sortie au parc en famille : les indispensables.

Ensuite : critères (ombre, WC, clôture, accessibilité PMR), sorties par saison ou météo, idées pour les collectivités
(valoriser et entretenir ses aires de jeux, traiter les signalements). Toute proposition de sujet doit viser une
**intention de recherche claire** et pouvoir s'appuyer sur des **sources vérifiables**.

## 9. Appels à l'action

- Principal : « Ouvrir l'app Toboggo » → `https://toboggo-app.vercel.app`.
- Secondaires : `/fonctionnalites/`, `/faq/`. Pour les collectivités : `/collectivites/` ou `/contact/?sujet=partenariat`.
- Un seul CTA principal par article, placé naturellement (pas de bandeau promotionnel dans le texte).

## 10. Données et attribution

- Les parcs importés viennent en partie d'**OpenStreetMap** (licence ODbL). Si un article reprend ou analyse ces
  données, **attribuer** : « © contributeurs OpenStreetMap ».
- Ne reproduis jamais un texte, une photo ou un schéma protégé : reformule, cite brièvement, renvoie vers la source.
