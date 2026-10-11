import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@toboggo/design-system";
import { listFeatures, listMedia, listParkFeatures, type Park } from "@toboggo/shared";
import { groupFeatures, isValueFeature } from "../../lib/featureCatalogue";
import { ParkLocationEditor } from "./ParkLocationEditor";
import styles from "../ParkDetail.module.css";

/** Destinations valides depuis la Vue d'ensemble — jamais "overview"
 * lui-même. Type dupliqué à dessein (littéral) plutôt qu'importé de
 * `../ParkDetail`, pour ne pas créer de dépendance circulaire entre les deux
 * fichiers (ParkDetail → OverviewPanel → ParkDetail). */
export type OverviewNavigableTab = "info" | "features" | "photos" | "history";

/** Lignes d'adresse structurée — même logique que InfoPanel (dupliquée
 * volontairement : affichage pur, pas de logique métier à mutualiser). */
function addressLines(park: Park): string[] {
  const street = (park.address_line ?? "").trim();
  const cityLine = [park.postal_code ?? "", park.city ?? ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  return [street, cityLine].filter(Boolean);
}

function CardHeader({ title, onNavigate }: { title: string; onNavigate?: () => void }) {
  return (
    <div className={styles.overviewCardHeader}>
      <h3 className={styles.overviewCardTitle}>{title}</h3>
      {onNavigate && (
        <button type="button" className={styles.overviewLink} onClick={onNavigate}>
          Voir l'onglet
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  );
}

export function OverviewPanel({
  park,
  onNavigateTab,
}: {
  park: Park;
  onNavigateTab: (tab: OverviewNavigableTab) => void;
}) {
  const { data: catalogue = [] } = useQuery({ queryKey: ["features-catalogue"], queryFn: () => listFeatures() });
  const { data: parkFeatures = [] } = useQuery({
    queryKey: ["park-features", park.id],
    queryFn: () => listParkFeatures(park.id),
  });
  const { data: media = [] } = useQuery({ queryKey: ["park-media", park.id], queryFn: () => listMedia(park.id) });

  const pfByFeatureId = useMemo(() => {
    const m: Record<string, (typeof parkFeatures)[number]> = {};
    for (const pf of parkFeatures) m[pf.feature_id] = pf;
    return m;
  }, [parkFeatures]);

  const groups = useMemo(() => groupFeatures(catalogue), [catalogue]);
  const featureSummary = useMemo(
    () =>
      groups.map((g) => ({
        label: g.label,
        answered: g.features.filter((f) => {
          const pf = pfByFeatureId[f.id];
          if (!pf) return false;
          return isValueFeature(f) ? pf.value != null && pf.value !== "unknown" : pf.status !== "unknown";
        }).length,
        total: g.features.length,
      })),
    [groups, pfByFeatureId],
  );
  const totalAnswered = featureSummary.reduce((n, g) => n + g.answered, 0);
  const totalFeatures = featureSummary.reduce((n, g) => n + g.total, 0);

  const photos = media.filter((m) => m.status !== "rejected");
  const addr = addressLines(park);
  const hasAge = park.min_age != null || park.max_age != null;

  return (
    <div className={styles.panel}>
      <div className={styles.overviewGrid}>
        <Card className={styles.overviewCard} variant="admin">
          <CardHeader title="Localisation" onNavigate={() => onNavigateTab("info")} />
          {(addr.length > 0 || hasAge) && (
            <dl className={styles.dl}>
              {addr.length > 0 && (
                <>
                  <dt>Adresse</dt>
                  <dd className={styles.addrLines}>
                    {addr.map((line, i) => (
                      <span key={i}>{line}</span>
                    ))}
                  </dd>
                </>
              )}
              {hasAge && (
                <>
                  <dt>Âges</dt>
                  <dd>{`${park.min_age ?? "?"}–${park.max_age ?? "?"} ans`}</dd>
                </>
              )}
            </dl>
          )}
          <ParkLocationEditor
            editing={false}
            latitude={park.latitude != null ? String(park.latitude) : ""}
            longitude={park.longitude != null ? String(park.longitude) : ""}
          />
        </Card>

        <Card className={styles.overviewCard} variant="admin">
          <CardHeader title="Équipements & services" onNavigate={() => onNavigateTab("features")} />
          {totalFeatures === 0 ? (
            <p className={styles.empty}>Catalogue indisponible</p>
          ) : totalAnswered === 0 ? (
            <p className={styles.empty}>Aucune caractéristique renseignée</p>
          ) : (
            <ul className={styles.overviewFeatList}>
              {featureSummary
                .filter((g) => g.total > 0)
                .map((g) => (
                  <li key={g.label} className={styles.overviewFeatRow}>
                    <span>{g.label}</span>
                    <span className={styles.overviewFeatCount}>
                      {g.answered} / {g.total}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card className={styles.overviewCard} variant="admin">
          <CardHeader title="Photos" onNavigate={() => onNavigateTab("photos")} />
          {photos.length === 0 ? (
            <p className={styles.empty}>Aucune photo pour ce parc</p>
          ) : (
            <>
              <div className={styles.overviewPhotoRow}>
                {photos.slice(0, 4).map((m) => (
                  <img
                    key={m.id}
                    className={styles.overviewPhotoThumb}
                    src={m.url}
                    alt=""
                    loading="lazy"
                  />
                ))}
              </div>
              <p className={styles.overviewPhotoCount}>
                {photos.length} photo{photos.length > 1 ? "s" : ""}
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
