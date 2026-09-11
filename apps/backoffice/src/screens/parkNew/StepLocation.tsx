import { useState } from "react";
import { Input } from "@toboggo/design-system";
import { ParkLocationEditor } from "../parkDetail/ParkLocationEditor";
import { PlaceSearch } from "./PlaceSearch";
import type { ParkDraft } from "./ParkNew";
import styles from "./ParkNew.module.css";

/**
 * Étape 1 — Localisation.
 *
 * Hiérarchie : la POSITION est l'action principale (recherche → carte →
 * lat/lng) ; l'ADRESSE structurée vient ensuite, secondaire et facultative.
 *
 * Recherche géographique (3C.4b) : aide au positionnement uniquement — recentre
 * la carte + place le repère + met à jour lat/lng du brouillon. L'adresse
 * structurée reste indépendante (jamais remplie depuis un résultat de recherche).
 */
export function StepLocation({
  draft,
  patch,
  coordError,
}: {
  draft: ParkDraft;
  patch: (next: Partial<ParkDraft>) => void;
  /** Message d'erreur coordonnées à afficher (ex. au clic « Continuer »). */
  coordError: string | null;
}) {
  // Jeton de recadrage : incrémenté à chaque sélection de résultat de recherche
  // pour demander à la carte un `flyTo` animé sur la nouvelle position.
  const [flyToken, setFlyToken] = useState(0);

  return (
    <div className={styles.form}>
      {/* ── Position (action principale) ──────────────────────────────── */}
      <div className={styles.formWide}>
        <h4 className={styles.groupTitle}>Position du parc</h4>

        <PlaceSearch
          onSelect={(lat, lng) => {
            patch({ latitude: lat.toFixed(6), longitude: lng.toFixed(6) });
            setFlyToken((t) => t + 1);
          }}
        />

        <ParkLocationEditor
          editing
          directMove
          tall
          flyToSignal={flyToken}
          latitude={draft.latitude}
          longitude={draft.longitude}
          onChange={(latitude, longitude) => patch({ latitude, longitude })}
        />
        {coordError && <p className={styles.fieldError}>{coordError}</p>}
      </div>

      {/* ── Adresse (secondaire, facultative) ─────────────────────────── */}
      <div className={styles.formWide}>
        <h4 className={styles.groupTitle}>Adresse (facultative)</h4>
        <Input
          label="Adresse / voie"
          value={draft.addressLine}
          placeholder="Ex. 12 rue des Écoles"
          onChange={(e) => patch({ addressLine: e.target.value })}
        />
        <div className={styles.twoCol}>
          <Input
            label="Code postal"
            value={draft.postalCode}
            inputMode="numeric"
            placeholder="Ex. 12100"
            onChange={(e) => patch({ postalCode: e.target.value })}
          />
          <Input
            label="Ville"
            value={draft.city}
            placeholder="Ex. Millau"
            onChange={(e) => patch({ city: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
