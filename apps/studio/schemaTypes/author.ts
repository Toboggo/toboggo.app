import { UserIcon } from "@sanity/icons/User";
import { defineField, defineType } from "sanity";

export const author = defineType({
  name: "author",
  title: "Auteur",
  type: "document",
  icon: UserIcon,
  fields: [
    defineField({ name: "name", title: "Nom", type: "string", validation: (rule) => rule.required() }),
    defineField({
      name: "slug",
      title: "Identifiant d'URL",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "role",
      title: "Fonction",
      type: "string",
      description: "Ex. « Équipe Toboggo ». Affichée sous le nom.",
    }),
    defineField({
      name: "bio",
      title: "Courte présentation",
      type: "text",
      rows: 3,
      validation: (rule) => rule.max(300),
    }),
    defineField({
      name: "image",
      title: "Photo",
      type: "image",
      options: { hotspot: true },
      fields: [defineField({ name: "alt", type: "string", title: "Texte alternatif" })],
    }),
  ],
  preview: { select: { title: "name", subtitle: "role", media: "image" } },
});
