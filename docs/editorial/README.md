# Assistant éditorial Toboggo — installation dans Claude

Objectif : un Projet Claude « **Rédaction SEO Toboggo** » (Claude normal, claude.ai ou application) qui prépare des
**brouillons** d'articles dans Sanity. Tu relis, prévisualises et publies toi-même.

| Fichier | Où il va dans le Projet |
|---|---|
| `instructions-redacteur.md` | Champ **Instructions** du projet (copier-coller le contenu) |
| `fiche-toboggo.md` | **Connaissances** du projet (fichier ajouté) |
| `reference-sanity.md` | **Connaissances** du projet (fichier ajouté) |

> Les libellés exacts de l'interface Claude peuvent varier ; l'idée reste la même.

## 1. Créer le projet (5 min)

1. Claude → **Projets** → **Nouveau projet** → nom : `Rédaction SEO Toboggo`.
2. **Instructions du projet** : ouvre `instructions-redacteur.md`, copie tout **sauf** l'encadré d'introduction (les
   deux premières lignes commençant par `>`), colle dans le champ Instructions, enregistre.
3. **Connaissances** : ajoute `fiche-toboggo.md` et `reference-sanity.md` (importer les fichiers, ou coller leur contenu
   dans des documents texte).
4. Vérifie que la **recherche web** est activée pour ce projet / cette conversation (nécessaire pour les sources).

## 2. Connecter Sanity

1. Paramètres → **Connecteurs** → ajoute **Sanity** et connecte-toi avec le compte qui a accès au projet
   `1m1y03h0` (le même que le Studio). Ouvre le connecteur dans le projet / la conversation.
2. **Permissions des outils** (important) : le connecteur agit **avec ton compte Sanity**, donc ses droits sont ceux
   d'un éditeur. Les règles « brouillons uniquement » des instructions sont une consigne, pas un verrou technique.
   Pour un vrai verrou, règle chaque outil dans les paramètres du connecteur :
   - **Autoriser** : requêtes/lecture (`query_documents`, `get_document`, `get_schema`, `list_*`).
   - **Demander confirmation** : `create_documents`, `patch_documents` (tu vois ce qui est écrit).
   - **Bloquer / ne jamais autoriser** : `publish_documents`, `unpublish_documents`, `discard_drafts`,
     `version_discard`, `create_release`, `create_version`, `deploy_schema`, `deploy_studio`, tout `*dataset*`,
     `*cors*`, `create_project`, et les téléversements (`*assets_upload*`, `media_*`).
   Si l'interface ne permet pas de bloquer un outil, laisse-le sur « demander confirmation » et refuse toute
   demande de publication.
3. Aucun jeton ni mot de passe n'est à copier dans le projet : la connexion se fait par ton compte.

## 3. Tester (avant le premier vrai article)

Dans une conversation du projet :

1. *« Liste les catégories et auteurs publiés dans Sanity. »* → doit lire sans rien écrire. S'il n'y en a aucun,
   crée-les d'abord dans le Studio et **publie-les** (un article ne peut référencer qu'une catégorie/un auteur publié).
2. *« Résume en 5 lignes ce que Toboggo propose aux familles. »* → doit s'appuyer sur la fiche, sans chiffre ni
   fonctionnalité inventés (pas d'App Store, pas de « 2 400 parcs »).
3. *« Publie l'article. »* → doit **refuser** et t'expliquer qu'il faut publier dans le Studio.
4. *« Rédige un article sur : comment choisir une aire de jeux adaptée à l'âge de son enfant ? »* → doit annoncer
   cadrage, vérification de l'existant, plan, puis créer **un brouillon** et rendre le compte rendu (sources, points à
   vérifier, actions Studio).

## 4. Travailler au quotidien

1. Demande un article : sujet, public, éventuelles contraintes (longueur, mots-clés, collectivités ou parents).
2. Valide le plan si l'assistant le demande (sujets sensibles).
3. Lis le **compte rendu** : sources, points à vérifier. Contrôle les faits importants dans les sources citées.
4. Dans le **Studio** (`https://toboggo-editorial.sanity.studio`) : ouvre le brouillon, ajoute l'**image de couverture
   et son texte alternatif**, vérifie catégorie, auteur et date, relis, corrige.
5. **Prévisualiser** (menu `⋯` du document → « Prévisualiser »), vérifie le rendu sur mobile et ordinateur.
6. **Publier** dans le Studio. Le site se reconstruit tout seul (1 à 2 minutes), puis l'article apparaît sur
   `/guides/<slug>/`, dans la liste, sur l'accueil et dans le sitemap.
7. Pour corriger : demande à l'assistant de modifier **le brouillon**, ou édite directement dans le Studio.

## 5. Garder le contexte à jour

| Quand | Quoi mettre à jour |
|---|---|
| Nouvelle fonctionnalité de l'app ou de l'espace collectivité, sortie sur les stores, nouveau domaine | `fiche-toboggo.md` §4, §5, §9 |
| Chiffres de couverture validés, mentions légales complétées, nouveaux clients/partenaires autorisés | `fiche-toboggo.md` §6 |
| Changement de ton ou de charte | `fiche-toboggo.md` §7 |
| Champ ajouté/modifié dans le schéma du Studio (`apps/studio/schemaTypes/`) | `reference-sanity.md` §2–§4 |
| Nouvelle règle de travail | `instructions-redacteur.md` |

Après modification d'un fichier du dépôt : remplace le fichier dans les **Connaissances** du projet (ou recolle les
Instructions). Les copies du projet ne se mettent pas à jour toutes seules.

## 6. Limites à connaître

- L'assistant ne voit ni l'aperçu ni le site publié : c'est toi qui valides le rendu.
- Il ne téléverse pas d'images : la couverture (obligatoire) est toujours ajoutée par toi.
- Les sources web peuvent être fausses ou datées : la relecture des points clés reste indispensable.
- Les fichiers de ce dossier ne contiennent aucun secret ; ne colle jamais de jeton dans le projet.
