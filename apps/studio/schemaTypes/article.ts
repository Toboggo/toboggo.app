import { DocumentTextIcon } from "@sanity/icons/DocumentText";
import { defineField, defineType, type SlugIsUniqueValidator } from "sanity";

/** Unicité du slug parmi les articles, brouillons et versions publiées confondus. */
const isSlugUnique: SlugIsUniqueValidator = async (slug, context) => {
  const id = (context.document?._id ?? "").replace(/^drafts\./, "");
  const client = context.getClient({ apiVersion: "2025-02-19" });
  const exists = await client.fetch<boolean>(
    `defined(*[_type == "article" && slug.current == $slug && !(_id in [$draft, $published])][0]._id)`,
    { slug, draft: `drafts.${id}`, published: id },
  );
  return !exists;
};

export const article = defineType({
  name: "article",
  title: "Article",
  type: "document",
  icon: DocumentTextIcon,
  groups: [
    { name: "contenu", title: "Contenu", default: true },
    { name: "seo", title: "Référencement (SEO)" },
  ],
  fields: [
    defineField({ name: "title", title: "Titre", type: "string", group: "contenu", validation: (rule) => rule.required().max(120) }),
    defineField({
      name: "slug",
      title: "Identifiant d'URL (slug)",
      type: "slug",
      group: "contenu",
      description: "Dernière partie de l'adresse : /guides/<slug>/. Ne plus le modifier après publication (l'URL change).",
      options: { source: "title", maxLength: 96, isUnique: isSlugUnique },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "excerpt",
      title: "Résumé",
      type: "text",
      rows: 3,
      group: "contenu",
      description: "Affiché dans la liste des articles et utilisé par défaut comme description SEO.",
      validation: (rule) => rule.required().min(40).max(300),
    }),
    defineField({
      name: "coverImage",
      title: "Image de couverture",
      type: "image",
      group: "contenu",
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          type: "string",
          title: "Texte alternatif",
          description: "Décrit ce que montre la photo, pas le titre de l'article.",
          validation: (rule) =>
            rule.custom((value, context) => {
              const parent = context.parent as { asset?: unknown } | undefined;
              return parent?.asset && !value ? "Le texte alternatif est obligatoire quand une image est ajoutée." : true;
            }),
        }),
      ],
      validation: (rule) => rule.required().error("Une image de couverture est requise."),
    }),
    defineField({ name: "category", title: "Catégorie", type: "reference", to: [{ type: "category" }], group: "contenu", validation: (rule) => rule.required() }),
    defineField({ name: "author", title: "Auteur", type: "reference", to: [{ type: "author" }], group: "contenu", validation: (rule) => rule.required() }),
    defineField({
      name: "publishedAt",
      title: "Date de publication",
      type: "datetime",
      group: "contenu",
      description: "Un article dont la date est dans le futur n'apparaît sur le site qu'à cette date (au prochain redéploiement).",
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "updatedAt",
      title: "Date de modification",
      type: "datetime",
      group: "contenu",
      description: "À renseigner uniquement après une mise à jour de fond. Laisser vide sinon.",
    }),
    defineField({ name: "body", title: "Contenu", type: "blockContent", group: "contenu", validation: (rule) => rule.required() }),
    defineField({
      name: "seoTitle",
      title: "Titre SEO",
      type: "string",
      group: "seo",
      description: "Optionnel. Par défaut : le titre. Recommandé : 60 caractères maximum.",
      validation: (rule) => rule.max(70).warning("Au-delà de ~60 caractères, le titre sera tronqué dans Google."),
    }),
    defineField({
      name: "seoDescription",
      title: "Description SEO",
      type: "text",
      rows: 3,
      group: "seo",
      description: "Optionnel. Par défaut : le résumé. Recommandé : 155 caractères maximum.",
      validation: (rule) => rule.max(170).warning("Au-delà de ~155 caractères, la description sera tronquée dans Google."),
    }),
  ],
  orderings: [
    { title: "Date de publication (récent d'abord)", name: "publishedAtDesc", by: [{ field: "publishedAt", direction: "desc" }] },
  ],
  preview: {
    select: { title: "title", subtitle: "category.title", media: "coverImage", date: "publishedAt" },
    prepare: ({ title, subtitle, media, date }) => ({
      title,
      subtitle: [subtitle, date ? new Date(date).toLocaleDateString("fr-FR") : null].filter(Boolean).join(" · "),
      media,
    }),
  },
});
