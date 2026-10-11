import { TagIcon } from "@sanity/icons/Tag";
import { defineField, defineType } from "sanity";

export const category = defineType({
  name: "category",
  title: "Catégorie",
  type: "document",
  icon: TagIcon,
  fields: [
    defineField({ name: "title", title: "Titre", type: "string", validation: (rule) => rule.required() }),
    defineField({
      name: "slug",
      title: "Identifiant d'URL",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({ name: "description", title: "Description", type: "text", rows: 3, validation: (rule) => rule.max(300) }),
  ],
  preview: { select: { title: "title", subtitle: "description" } },
});
