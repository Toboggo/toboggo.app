import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? "1m1y03h0",
    dataset: process.env.SANITY_STUDIO_DATASET ?? "production",
  },
});
