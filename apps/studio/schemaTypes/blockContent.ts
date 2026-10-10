import { defineArrayMember, defineField, defineType } from "sanity";

/** Contenu riche d'un article : titres H2–H4, listes, citation, liens, images avec alt obligatoire. */
export const blockContent = defineType({
  name: "blockContent",
  title: "Contenu riche",
  type: "array",
  of: [
    defineArrayMember({
      type: "block",
      styles: [
        { title: "Paragraphe", value: "normal" },
        { title: "Titre 2", value: "h2" },
        { title: "Titre 3", value: "h3" },
        { title: "Titre 4", value: "h4" },
        { title: "Citation", value: "blockquote" },
      ],
      lists: [
        { title: "Liste à puces", value: "bullet" },
        { title: "Liste numérotée", value: "number" },
      ],
      marks: {
        decorators: [
          { title: "Gras", value: "strong" },
          { title: "Italique", value: "em" },
        ],
        annotations: [
          {
            name: "link",
            type: "object",
            title: "Lien",
            fields: [
              defineField({
                name: "href",
                type: "url",
                title: "Adresse",
                validation: (rule) =>
                  rule.required().uri({ scheme: ["http", "https", "mailto"], allowRelative: true }),
              }),
            ],
          },
        ],
      },
    }),
    defineArrayMember({
      type: "image",
      title: "Image",
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          type: "string",
          title: "Texte alternatif",
          description: "Décrit ce que montre l'image (accessibilité et référencement).",
          validation: (rule) => rule.required().error("Le texte alternatif est obligatoire."),
        }),
        defineField({ name: "caption", type: "string", title: "Légende" }),
      ],
    }),
  ],
});
