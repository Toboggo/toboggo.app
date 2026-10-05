import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Icon, Input } from "@toboggo/design-system";
import { getParkDisplayName, haversineMeters, searchParks, type Park } from "@toboggo/shared";
import { ParkPhoto } from "../ParkPhoto";
import { useFormat } from "../../i18n/useFormat";
import { useGeo } from "../../lib/geo";
import { dedupeAddress } from "./Recap";
import { MissingParkCard, MissingParkSheet } from "./MissingPark";
import styles from "./Flow.module.css";

/** Carte compacte d'un parc : photo (ou repli de marque), nom, adresse, méta. */
export function ParkCardMini({
  park,
  meta,
  selected,
  onPress,
}: {
  park: Park;
  /** Texte secondaire additionnel (ex. distance). */
  meta?: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { t } = useTranslation("contribute");
  const name = getParkDisplayName(park, t);
  const body = (
    <>
      <ParkPhoto park={park} markSize={20} className={styles.parkThumb} />
      <div className={styles.parkBody}>
        <div className={styles.parkName}>{name}</div>
        {park.formatted_address && <div className={styles.parkMeta}>{dedupeAddress(park.formatted_address)}</div>}
        {meta && <div className={styles.parkMeta}>{meta}</div>}
      </div>
      {selected && <Icon name="ic-check" size={18} style={{ color: "var(--color-primary)" }} />}
    </>
  );
  return onPress ? (
    <button type="button" className={styles.parkCard} aria-pressed={Boolean(selected)} onClick={onPress}>
      {body}
    </button>
  ) : (
    <div className={styles.parkCard}>{body}</div>
  );
}

/**
 * Étape « Choisir le parc » commune à Ajouter des photos / Donner mon avis /
 * Signaler un problème : recherche, sélection explicite (carte cochée), aperçu.
 * Le bouton « Continuer » reste dans le pied de page de l'écran, activé dès
 * qu'un parc est choisi.
 */
export function ParkChooser({
  selected,
  onSelect,
  onAddPark,
}: {
  selected: Park | null;
  onSelect: (park: Park) => void;
  /**
   * « Je ne trouve pas mon parc » → explication « Ajoutez d'abord ce parc »,
   * puis « Ajouter un parc » appelle ceci (l'écran ouvre un nouvel ajout).
   */
  onAddPark: () => void;
}) {
  const { t } = useTranslation("contribute");
  const f = useFormat();
  const { hasFix, lat, lng } = useGeo();
  const [query, setQuery] = useState("");
  const [explain, setExplain] = useState(false);
  const enabled = query.trim().length >= 2;
  const { data: results = [], isFetching, isError, refetch } = useQuery({
    queryKey: ["park-chooser", query.trim()],
    queryFn: () => searchParks(query),
    enabled,
  });

  return (
    <>
      <h2 className={styles.title}>{t("flow.chooser.title")}</h2>
      <p className={styles.subtitle}>{t("flow.chooser.hint")}</p>

      {selected && (
        <section aria-label={t("flow.chooser.selected")} style={{ marginBottom: 16 }}>
          <div className={styles.groupTitle} style={{ marginTop: 0 }}>
            {t("flow.chooser.selected")}
          </div>
          <ParkCardMini park={selected} selected />
        </section>
      )}

      <Input
        label={t("flow.chooser.searchLabel")}
        placeholder={t("picker.placeholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      <div aria-live="polite">
        {enabled && isFetching && <p className={styles.muted} style={{ marginTop: 10 }}>{t("common.searching")}</p>}
        {enabled && !isFetching && isError && (
          <p className={styles.muted} style={{ marginTop: 10 }}>
            {t("flow.chooser.error")}{" "}
            <button type="button" className={styles.linkButton} onClick={() => void refetch()}>
              {t("flow.retry")}
            </button>
          </p>
        )}
        {enabled && !isFetching && !isError && results.length === 0 && (
          <p className={styles.muted} style={{ marginTop: 10 }}>{t("addParkSearch.noResults")}</p>
        )}
      </div>
      <div className={styles.parkList}>
        {results.map((p) => (
          <ParkCardMini
            key={p.id}
            park={p}
            selected={selected?.id === p.id}
            meta={hasFix ? f.distance(haversineMeters(lat, lng, p.latitude, p.longitude)) : undefined}
            onPress={() => onSelect(p)}
          />
        ))}
      </div>
      {/* Toujours accessible : aussi sans résultat, et même si la recherche a échoué. */}
      <MissingParkCard onPress={() => setExplain(true)} />
      {!selected && <p className={styles.chooseHint}>{t("flow.chooser.selectToContinue")}</p>}
      <MissingParkSheet
        open={explain}
        onClose={() => setExplain(false)}
        onAddPark={() => {
          setExplain(false);
          onAddPark();
        }}
      />
    </>
  );
}
