import { EyeOpenIcon } from "@sanity/icons/EyeOpen";
import { createPreviewSecret } from "@sanity/preview-url-secret/create-secret";
import { useState } from "react";
import { useClient, useCurrentUser, type DocumentActionComponent } from "sanity";

const siteUrl = process.env.SANITY_STUDIO_SITE_URL ?? "https://toboggo-website.vercel.app";

/**
 * « Prévisualiser » : ouvre le brouillon sur le site dans un nouvel onglet.
 *
 * Authentification : le Studio crée, avec la session de l'éditeur (donc uniquement quelqu'un qui peut écrire dans le
 * dataset), un secret à usage limité (1 h) stocké dans un document brouillon du dataset. Le site (côté serveur,
 * avec son jeton de lecture) vérifie ce secret puis pose un cookie de prévisualisation. Aucun secret n'est stocké
 * dans ce code ni dans le bundle du Studio.
 */
export const previewAction: DocumentActionComponent = (props) => {
  const client = useClient({ apiVersion: "2025-02-19" });
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const doc = (props.draft ?? props.published) as { slug?: { current?: string } } | null;
  const slug = doc?.slug?.current;

  return {
    label: busy ? "Ouverture…" : "Prévisualiser",
    icon: EyeOpenIcon,
    disabled: !slug || busy,
    title: slug ? "Ouvrir la prévisualisation du brouillon sur le site" : "Renseignez d'abord le slug de l'article",
    onHandle: async () => {
      setBusy(true);
      try {
        const { secret } = await createPreviewSecret(client, "toboggo-studio", window.location.origin, user?.id);
        const url = new URL("/api/preview/enable/", siteUrl);
        url.searchParams.set("sanity-preview-secret", secret);
        url.searchParams.set("sanity-preview-pathname", `/apercu/${slug}/`);
        window.open(url.toString(), "_blank", "noopener");
      } finally {
        setBusy(false);
        props.onComplete();
      }
    },
  };
};
