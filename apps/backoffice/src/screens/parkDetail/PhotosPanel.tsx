import { useQuery } from "@tanstack/react-query";
import { Button, Tag, useConfirm, useToast } from "@toboggo/design-system";
import {
  addParkPhotos,
  deleteMediaByUrl,
  listMedia,
  setParkCover,
  uploadPhoto,
  type ParkMedia,
  type SourceType,
} from "@toboggo/shared";
import { useOrgScope } from "../../lib/orgScope";
import { useOrgSession } from "../../lib/orgSession";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { queryClient } from "../../lib/queryClient";
import styles from "../ParkDetail.module.css";

const SOURCE_LABEL: Partial<Record<SourceType, string>> = {
  user: "Contribution",
  municipality: "Collectivité",
  toboggo: "Toboggo",
  osm: "OpenStreetMap",
  open_data: "Open data",
  partner: "Partenaire",
  other: "Autre",
};

function provenance(m: ParkMedia): string | null {
  const parts: string[] = [];
  if (m.source && SOURCE_LABEL[m.source]) parts.push(SOURCE_LABEL[m.source]!);
  if (m.attribution) parts.push(m.attribution);
  else if (m.author) parts.push(m.author);
  if (m.license) parts.push(m.license);
  return parts.length ? parts.join(" · ") : null;
}

export function PhotosPanel({ parkId, canManage }: { parkId: string; canManage: boolean }) {
  const { communeId } = useOrgScope();
  const userId = useOrgSession((s) => s.userId);
  const confirm = useConfirm();
  const toast = useToast();

  const { data: media = [], isLoading } = useQuery({
    queryKey: ["park-media", parkId],
    queryFn: () => listMedia(parkId),
  });
  const photos = media.filter((m) => m.status !== "rejected");

  function invalidate() {
    for (const key of [["park-media", parkId], ["park", parkId], ["bo-parks-page"]]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const { run: upload, pending: uploading } = useAsyncAction(
    async (file: File) => {
      if (!userId) throw new Error("Session expirée — reconnectez-vous.");
      // Storage RLS (0027) keys the object path on the uploader's own uid.
      const url = await uploadPhoto("parkPhotos", file, userId);
      await addParkPhotos(parkId, [url], { source: communeId ? "municipality" : "toboggo" });
      invalidate();
    },
    { successMessage: "Photo ajoutée.", errorMessage: () => "L'envoi de la photo a échoué." },
  );

  const { run: makeCover, pending: coverPending } = useAsyncAction(
    async (m: ParkMedia) => {
      await setParkCover(parkId, m.id);
      invalidate();
    },
    { successMessage: "Photo de couverture mise à jour." },
  );

  const { run: remove, pending: removePending } = useAsyncAction(async (m: ParkMedia) => {
    const ok = await confirm({
      title: "Supprimer la photo",
      message: "Cette photo sera définitivement supprimée du parc.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    await deleteMediaByUrl(parkId, m.url);
    invalidate();
    toast.success("Photo supprimée.");
  });

  const busy = uploading || coverPending || removePending;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await upload(file);
  }

  if (isLoading) return <p className={styles.stateBox}>Chargement des photos…</p>;

  if (photos.length === 0 && !canManage) {
    return <p className={styles.stateBox}>Aucune photo pour ce parc.</p>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.photoGrid}>
        {photos.map((m) => {
          const prov = provenance(m);
          return (
            <div key={m.id} className={`${styles.photoCard} ${m.is_cover ? styles.isCover : ""}`}>
              <img className={styles.photoImg} src={m.url} alt={m.caption ?? "Photo du parc"} loading="lazy" />
              <div className={styles.photoBody}>
                <div className={styles.photoBadges}>
                  {m.is_cover && <Tag tone="primary">Couverture</Tag>}
                  {m.status === "pending" && <Tag tone="warning">En attente</Tag>}
                </div>
                {prov ? <div className={styles.photoMetaLine}>{prov}</div> : <span className={styles.empty}>Provenance non renseignée</span>}
              </div>
              {canManage && (
                <div className={styles.photoActions}>
                  {!m.is_cover && m.status === "approved" && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => makeCover(m)}>
                      Définir couverture
                    </Button>
                  )}
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(m)}>
                    Supprimer
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {canManage && (
          <label className={styles.uploadTile}>
            {uploading ? "Envoi en cours…" : "Ajouter une photo"}
            <input type="file" accept="image/*" hidden disabled={busy} onChange={onPick} />
          </label>
        )}
      </div>
    </div>
  );
}
