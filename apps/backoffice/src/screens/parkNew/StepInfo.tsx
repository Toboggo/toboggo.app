import { Input, Textarea } from "@toboggo/design-system";
import type { ParkDraft } from "./ParkNew";
import styles from "./ParkNew.module.css";

/** Résumé compact de la localisation saisie à l'étape 1. */
function LocationSummary({ draft, onEdit }: { draft: ParkDraft; onEdit: () => void }) {
  const street = draft.addressLine.trim();
  const cityLine = [draft.postalCode.trim(), draft.city.trim()].filter(Boolean).join(" ");
  const lines = [street, cityLine].filter(Boolean);
  const lat = Number(draft.latitude);
  const lng = Number(draft.longitude);
  const hasCoords = draft.latitude.trim() !== "" && draft.longitude.trim() !== "" && Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <div className={styles.summary}>
      <div className={styles.summaryHead}>
        <h4>Localisation</h4>
        <button type="button" className={styles.summaryEdit} onClick={onEdit}>
          Modifier
        </button>
      </div>
      <div className={styles.summaryLines}>
        {lines.length > 0 ? (
          lines.map((l, i) => <span key={i}>{l}</span>)
        ) : (
          <span className={styles.summaryEmpty}>Adresse non renseignée</span>
        )}
      </div>
      <div className={styles.summaryCoords}>
        {hasCoords ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "Position non renseignée"}
      </div>
    </div>
  );
}

/**
 * Étape 2 — Informations : nom obligatoire, âges/description facultatifs.
 * Aucun champ photos / caractéristiques / équipements / vérification (V1 BO —
 * complétés après création depuis la fiche parc).
 */
export function StepInfo({
  draft,
  patch,
  onEditLocation,
  nameError,
  ageError,
}: {
  draft: ParkDraft;
  patch: (next: Partial<ParkDraft>) => void;
  onEditLocation: () => void;
  nameError: string | null;
  ageError: string | null;
}) {
  return (
    <div>
      <LocationSummary draft={draft} onEdit={onEditLocation} />

      <div className={styles.form}>
        <Input
          label="Nom du parc"
          className={styles.formWide}
          value={draft.name}
          placeholder="Ex. Aire de jeux du Parc de la Victoire"
          error={nameError ?? undefined}
          onChange={(e) => patch({ name: e.target.value })}
        />

        <div className={`${styles.formWide}`}>
          <h4 className={styles.groupTitle}>Tranche d'âge (facultative)</h4>
          <div className={styles.twoCol}>
            <Input
              label="Âge minimum"
              type="number"
              min={0}
              max={18}
              value={draft.ageMin}
              onChange={(e) => patch({ ageMin: e.target.value })}
            />
            <Input
              label="Âge maximum"
              type="number"
              min={0}
              max={18}
              value={draft.ageMax}
              error={ageError ?? undefined}
              onChange={(e) => patch({ ageMax: e.target.value })}
            />
          </div>
        </div>

        <Textarea
          label="Description (facultative)"
          className={styles.formWide}
          rows={4}
          value={draft.description}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </div>
    </div>
  );
}
