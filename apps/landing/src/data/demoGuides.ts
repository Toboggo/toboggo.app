/**
 * Aperçu éditorial temporaire pour "Nos derniers guides & idées"
 * (Website-2 §8). AUCUN article réel n'existe encore : ce sont uniquement
 * des intitulés de sujets possibles, sans date ni auteur fictifs, sans
 * compteur fictif.
 *
 * `category`, `date`, `slug` : champs optionnels préparant la structure d'un
 * vrai article (Website-4, /guides/[slug]) — volontairement tous non
 * renseignés ici, aucun n'est inventé pour remplir l'UI. Une carte reste non
 * cliquable individuellement tant que `slug` n'existe pas ; seul le CTA
 * "Voir tous les articles" (→ /guides) est actif.
 *
 * `image`/`imageAlt` : photo réelle associée (voir
 * apps/landing/public/images/IMAGE-SOURCES.md pour la source/licence de
 * chacune). `imageAlt` décrit ce que montre la photo, pas le titre de
 * l'article — un alt doit rester factuel.
 */
export interface DemoGuide {
  title: string;
  category?: string;
  date?: string;
  image?: string;
  imageAlt?: string;
  slug?: string;
}

export const DEMO_GUIDES: DemoGuide[] = [
  {
    title: "Comment choisir une aire de jeux adaptée à l'âge de son enfant ?",
    image: "/images/home/guides/guide-age-enfant-aire-jeux.webp",
    imageAlt: "Enfant souriant accroché à une structure de jeu grimpante",
  },
  {
    title: "Que regarder avant de choisir un parc avec de jeunes enfants ?",
    image: "/images/home/guides/guide-choisir-aire-jeux.webp",
    imageAlt: "Enfants qui courent vers une structure de jeu à cordes dans une cour d'école",
  },
  {
    title: "Préparer une sortie au parc en famille : les indispensables",
    image: "/images/home/guides/guide-sortie-famille.webp",
    imageAlt: "Parents accroupis avec leur jeune enfant dans un parc en automne",
  },
];
