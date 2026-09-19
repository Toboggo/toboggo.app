import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, DataTable, Icon, Tag, type DataTableColumn } from "@toboggo/design-system";
import { getOrganization, listParks, listReports, listReviews, listActivity, type OrganizationType, type Park } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ParkStatusTag } from "../components/StatusTag";
import { activityIcon } from "../lib/activityCategory";
import styles from "./OrganizationDetail.module.css";

// Même valeurs/mêmes libellés que Organizations.tsx (pas de 2e formulation) —
// dupliqué ici plutôt qu'exporté : petite const locale, même convention que
// SOURCE_TYPE_LABEL (Dashboard.tsx) / SOURCE_LABEL (Photos.tsx).
const ORG_TYPE_LABEL: Record<OrganizationType, string> = {
  municipality: "Commune",
  intercommunality: "Intercommunalité",
  department: "Département",
  region: "Région",
  state: "État",
  private_operator: "Opérateur privé",
  association: "Association",
  other: "Autre",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/**
 * Fiche Collectivité 360 (Admin-UI-3C), lecture seule. Chaque section
 * réutilise exactement les API déjà scopées par organisation ailleurs dans
 * l'app (`listParks/listReports/listReviews({communeId})`, `listActivity`),
 * sans nouvelle logique de résolution org↔parc.
 *
 * Pas de section "Équipe" : la policy `team_read` (migration 0002, jamais
 * étendue) ne donne au staff aucun accès aux `team_members` d'une
 * collectivité dont il n'est pas membre — un compteur ici afficherait
 * silencieusement 0 même quand des membres existent réellement (même
 * constat que la liste Admin-UI-3B, voir `listOrganizationsWithCounts`).
 *
 * Pas d'abonnement/facturation/score qualité/utilisateurs actifs : aucune
 * de ces données n'existe dans le schéma réel (Gap Analysis).
 */
export default function OrganizationDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const orgQ = useQuery({ queryKey: ["org-detail", id], queryFn: () => getOrganization(id), enabled: !!id });
  const parksQ = useQuery({ queryKey: ["org-detail-parks", id], queryFn: () => listParks({ communeId: id }), enabled: !!id });
  const reportsQ = useQuery({ queryKey: ["org-detail-reports", id], queryFn: () => listReports({ communeId: id }), enabled: !!id });
  const reviewsQ = useQuery({ queryKey: ["org-detail-reviews", id], queryFn: () => listReviews({ communeId: id }), enabled: !!id });
  const activityQ = useQuery({ queryKey: ["org-detail-activity", id], queryFn: () => listActivity(id), enabled: !!id });

  function goBack() {
    navigate("/organizations");
  }

  if (orgQ.isLoading) {
    return (
      <div>
        <PageHeader title="Collectivité" />
        <p className={styles.stateBox}>Chargement…</p>
      </div>
    );
  }

  if (orgQ.isError) {
    return (
      <div>
        <PageHeader title="Collectivité" />
        <p className={styles.stateBox}>Impossible de charger cette collectivité.</p>
        <div style={{ textAlign: "center" }}>
          <Button size="sm" variant="secondary" onClick={() => void orgQ.refetch()}>
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  const org = orgQ.data;
  if (!org) {
    return (
      <div>
        <PageHeader title="Collectivité introuvable" />
        <p className={styles.stateBox}>Cette collectivité n'existe pas ou n'est pas accessible avec votre compte.</p>
        <div style={{ textAlign: "center" }}>
          <Button variant="secondary" size="sm" onClick={goBack}>
            Retour aux collectivités
          </Button>
        </div>
      </div>
    );
  }

  const parks = parksQ.data ?? [];
  const reports = reportsQ.data ?? [];
  const reviews = reviewsQ.data ?? [];
  const activity = activityQ.data ?? [];
  const openReports = reports.filter((r) => r.status === "open").length;
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

  function openPark(park: Park) {
    navigate(`/parks/${park.id}`);
  }

  const parkColumns: DataTableColumn<Park>[] = [
    {
      key: "name",
      header: "Parc",
      render: (p) => (
        <>
          <span className={styles.parkName}>{p.name}</span>
          <span className={styles.parkMeta}>{p.formatted_address ?? "Adresse non renseignée"}</span>
        </>
      ),
    },
    {
      key: "status",
      header: "Statut",
      width: "1px",
      render: (p) => <ParkStatusTag status={p.status} />,
    },
    {
      key: "rating",
      header: "Note",
      width: "1px",
      align: "right",
      render: (p) => (p.review_count > 0 ? `${p.rating.toFixed(1)} (${p.review_count})` : "—"),
    },
    {
      key: "action",
      header: "",
      width: "1px",
      align: "right",
      render: () => <span className={styles.viewAffordance}>Voir</span>,
    },
  ];

  return (
    <div>
      <nav className={styles.breadcrumb} aria-label="Fil d'Ariane">
        <a
          href="/organizations"
          onClick={(e) => {
            e.preventDefault();
            goBack();
          }}
        >
          Collectivités
        </a>
        <span className={styles.crumbSep} aria-hidden="true">
          ›
        </span>
        <span className={styles.crumbCurrent}>{org.name}</span>
      </nav>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{org.name}</h1>
          <div className={styles.tags}>
            <Tag tone="neutral">{ORG_TYPE_LABEL[org.type] ?? org.type}</Tag>
            <Tag tone={org.verified ? "primary" : "neutral"}>{org.verified ? "Vérifiée" : "Non vérifiée"}</Tag>
          </div>
        </div>
      </div>

      <div className={styles.meta}>
        <div>
          <span className={styles.metaLabel}>Créée le :</span>
          {dateFmt.format(new Date(org.created_at))}
        </div>
        {org.contact_email && (
          <div>
            <span className={styles.metaLabel}>Contact :</span>
            {org.contact_email}
          </div>
        )}
        {org.website && (
          <div>
            <span className={styles.metaLabel}>Site web :</span>
            <a href={org.website} target="_blank" rel="noreferrer" className={styles.parkLink}>
              {org.website}
            </a>
          </div>
        )}
        {org.country_code && (
          <div>
            <span className={styles.metaLabel}>Pays :</span>
            {org.country_code}
          </div>
        )}
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statBox}>
          <span className={styles.statValue}>{parksQ.isLoading ? "…" : parks.length}</span>
          <span className={styles.statLabel}>Parcs rattachés</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statValue}>{reportsQ.isLoading ? "…" : openReports}</span>
          <span className={styles.statLabel}>Signalements ouverts{!reportsQ.isLoading && ` (sur ${reports.length})`}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statValue}>{reviewsQ.isLoading ? "…" : reviews.length}</span>
          <span className={styles.statLabel}>Avis publiés{avgRating != null && ` · ${avgRating.toFixed(1)}/5`}</span>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Activité récente</h2>
        {activityQ.isError ? (
          <p className={styles.stateBoxInline}>Impossible de charger l'activité.</p>
        ) : activityQ.isLoading ? (
          <p className={styles.stateBoxInline}>Chargement…</p>
        ) : activity.length === 0 ? (
          <p className={styles.stateBoxInline}>Aucune activité enregistrée pour cette collectivité.</p>
        ) : (
          activity.slice(0, 8).map((a) => {
            const icon = activityIcon(a.text);
            return (
              <div key={a.id} className={styles.activityRow}>
                {icon ? (
                  <span className={styles.activityIconWrap}>
                    <Icon name={icon} size={13} />
                  </span>
                ) : (
                  <span className={styles.activityDot} />
                )}
                <div>
                  <div className={styles.activityText}>{a.text}</div>
                  <div className={styles.activityMeta}>
                    {a.actor} · {dateTimeFmt.format(new Date(a.created_at))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Parcs de la collectivité</h2>
        <DataTable
          caption={`Parcs rattachés à ${org.name}`}
          columns={parkColumns}
          rows={parks}
          getRowKey={(p) => p.id}
          onRowClick={openPark}
          rowLabel={(p) => `Ouvrir le parc — ${p.name}`}
          state={parksQ.isError ? "error" : parksQ.isLoading ? "loading" : "ready"}
          loadingRows={3}
          error={
            <>
              <p>Impossible de charger les parcs.</p>
              <Button size="sm" variant="secondary" onClick={() => void parksQ.refetch()}>
                Réessayer
              </Button>
            </>
          }
          empty={<p>Aucun parc rattaché à cette collectivité.</p>}
        />
      </div>
    </div>
  );
}
