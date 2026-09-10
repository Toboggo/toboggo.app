import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button, Input } from "@toboggo/design-system";
import { isValidCoordinate, mapStyleUrl } from "@toboggo/shared";
import styles from "../ParkDetail.module.css";

// Centre de repli (métropole) quand le parc n'a pas encore de position lisible.
const FRANCE_CENTER: [number, number] = [2.4, 46.6];

export interface ParkLocationEditorProps {
  /** Valeur brute du brouillon (portée par le state du formulaire Informations). */
  latitude: string;
  longitude: string;
  /** Le formulaire Informations est-il en mode édition ? */
  editing: boolean;
  /** Désactive les interactions pendant une sauvegarde. */
  disabled?: boolean;
  /**
   * Émet la paire suivante du brouillon (chaînes, 6 décimales pour les
   * interactions carte). N'écrit jamais en base — la persistance passe par le
   * bouton « Enregistrer » du formulaire.
   */
  onChange?: (latitude: string, longitude: string) => void;
}

function parseCoord(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Éditeur de position du parc pour l'onglet Informations.
 *
 * - Lecture : petite carte avec le repère réel + coordonnées discrètes.
 * - Édition : carte NON déplaçable par défaut ; action explicite « Déplacer le
 *   repère » qui active le clic-carte + le glisser du repère. Aucune écriture
 *   immédiate — uniquement le brouillon local.
 * - Sans `VITE_MAP_STYLE_URL` (ou style invalide) : pas de carte, uniquement les
 *   champs numériques Latitude / Longitude — qui restent aussi le chemin
 *   clavier-accessible quand la carte est disponible.
 */
export function ParkLocationEditor({
  latitude,
  longitude,
  editing,
  disabled,
  onChange,
}: ParkLocationEditorProps) {
  const styleUrl = mapStyleUrl();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const [moveMode, setMoveMode] = useState(false);

  const lat = parseCoord(latitude);
  const lng = parseCoord(longitude);
  const bothFilled = latitude.trim() !== "" && longitude.trim() !== "";
  const valid = lat != null && lng != null && isValidCoordinate(lat, lng);
  const invalid = bothFilled && !valid;

  // Le déplacement n'est réellement actif qu'en édition, hors sauvegarde.
  const moveActive = editing && moveMode && !disabled;

  // Refs pour que le handler de clic carte (enregistré une seule fois) voie
  // toujours les valeurs fraîches.
  const moveActiveRef = useRef(moveActive);
  moveActiveRef.current = moveActive;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function emit(nextLat: number, nextLng: number) {
    onChangeRef.current?.(nextLat.toFixed(6), nextLng.toFixed(6));
  }

  // Quitter le mode édition referme toujours le sous-mode « déplacer ».
  useEffect(() => {
    if (!editing) setMoveMode(false);
  }, [editing]);

  // ── Cycle de vie de la carte (création unique) ──────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!styleUrl || !el || mapRef.current) return;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: el,
        style: styleUrl,
        center: valid ? [lng as number, lat as number] : FRANCE_CENTER,
        zoom: valid ? 15 : 5,
        scrollZoom: false, // ne pas piéger le scroll de la page
      });
    } catch {
      // Style injoignable / invalide : on reste sur le fallback champs.
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("click", (e: maplibregl.MapMouseEvent) => {
      if (!moveActiveRef.current) return;
      emit(e.lngLat.lat, e.lngLat.lng);
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Création unique — les mises à jour (position, draggable) sont gérées par
    // l'effet ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  // ── Repère : présence / position / draggable ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!valid) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ draggable: false });
      marker.setLngLat([lng as number, lat as number]).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLngLat();
        emit(p.lat, p.lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([lng as number, lat as number]);
    }
    markerRef.current.setDraggable(moveActive);
    map.setCenter([lng as number, lat as number]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, valid, moveActive]);

  // ── Rendu ──────────────────────────────────────────────────────────────
  const coordsText = valid
    ? `${(lat as number).toFixed(6)}, ${(lng as number).toFixed(6)}`
    : "Position non renseignée";

  return (
    <div className={styles.locEditor}>
      {styleUrl ? (
        <div
          ref={containerRef}
          className={styles.locMap}
          data-move={moveActive ? "1" : undefined}
          aria-label="Carte de localisation du parc"
        />
      ) : editing ? (
        <p className={styles.locNoMap}>
          Carte indisponible. Saisissez la position dans les champs ci-dessous.
        </p>
      ) : null}

      {!editing && <p className={styles.locCoords}>{coordsText}</p>}

      {editing && (
        <>
          {styleUrl && (
            <div className={styles.locBar}>
              <Button
                type="button"
                variant={moveMode ? "primary" : "secondary"}
                size="sm"
                disabled={disabled}
                aria-pressed={moveMode}
                onClick={() => setMoveMode((v) => !v)}
              >
                {moveMode ? "Terminer le déplacement" : "Déplacer le repère"}
              </Button>
              {moveMode && (
                <span className={styles.locHint}>
                  Cliquez sur la carte ou faites glisser le repère.
                </span>
              )}
            </div>
          )}

          <div className={styles.twoCol}>
            <Input
              label="Latitude"
              type="number"
              step="0.000001"
              inputMode="decimal"
              placeholder="ex. 44.099776"
              value={latitude}
              disabled={disabled}
              error={invalid ? "Coordonnées invalides" : undefined}
              onChange={(e) => onChange?.(e.target.value, longitude)}
            />
            <Input
              label="Longitude"
              type="number"
              step="0.000001"
              inputMode="decimal"
              placeholder="ex. 3.111459"
              value={longitude}
              disabled={disabled}
              error={invalid ? "Coordonnées invalides" : undefined}
              onChange={(e) => onChange?.(latitude, e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
}
