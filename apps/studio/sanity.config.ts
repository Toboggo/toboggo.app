import { frFRLocale } from "@sanity/locale-fr-fr";
import { visionTool } from "@sanity/vision";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { previewAction } from "./previewAction";
import { schemaTypes } from "./schemaTypes";

const projectId = process.env.SANITY_STUDIO_PROJECT_ID ?? "1m1y03h0";
const dataset = process.env.SANITY_STUDIO_DATASET ?? "production";

export default defineConfig({
  name: "toboggo",
  title: "Toboggo — Blog",
  projectId,
  dataset,
  // Interface éditoriale en français.
  plugins: [
    frFRLocale(),
    structureTool(),
    visionTool({ defaultApiVersion: "2025-02-19" }),
  ],
  schema: { types: schemaTypes },
  document: {
    actions: (prev, context) => (context.schemaType === "article" ? [...prev, previewAction] : prev),
  },
});
