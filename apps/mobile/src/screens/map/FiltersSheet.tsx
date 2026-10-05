import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@toboggo/design-system";
import { listFeatures } from "@toboggo/shared";
import { ParkGlyph } from "../../components/addPark/ParkGlyph";
import { PRIMARY_GAME_CODES } from "../../lib/addParkModel";
import { useFeatureLabel } from "../../lib/featureLabel";
import { useFilters, searchByLabel, type AmenityFilters } from "../../lib/filters";
import { trackEvent } from "../../lib/analytics";
import styles from "./FiltersSheet.module.css";

// Débounce dédié à l'émission analytics du slider d'âge — ne change rien au
// comportement réel du filtre (`setAge` reste appelé à chaque tick,
// immédiat), seulement à quand l'événement `filter_applied` correspondant
// est envoyé, pour ne pas envoyer un événement par pixel glissé.
const AGE_FILTER_TRACK_DEBOUNCE_MS = 400;

const AMENITY_KEYS: (keyof AmenityFilters)[] = ["wc", "shade", "fenced", "pmr", "benches", "water", "parking"];
const AGE_TICKS = [0, 3, 6, 9, 12];
const AGE_MAX = 12;

interface GameOption {
  code: string;
  label: string;
}

/** Carte « picto au-dessus du texte » — sélection : contour + fond vert léger + coche. */
function ChoiceCard({
  glyph,
  label,
  on,
  onToggle,
}: {
  glyph: string;
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className={styles.card} aria-pressed={on} onClick={onToggle}>
      <ParkGlyph code={glyph} size={30} />
      <span className={styles.cardLabel}>{label}</span>
      {on && (
        <span className={styles.cardCheck} aria-hidden="true">
          <Icon name="ic-check" size={12} />
        </span>
      )}
    </button>
  );
}

export function FiltersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("map");
  const { t: tc } = useTranslation("contribute");
  const featureLabel = useFeatureLabel();
  const { ageLow, ageHigh, setAge, amenities, toggleAmenity, games, setGames, toggleGame, openNow, setOpenNow, reset } =
    useFilters();

  const [view, setView] = useState<"main" | "games">("main");
  const [draftGames, setDraftGames] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Même catalogue que « Ajouter un parc » : 6 jeux courants fixes, puis tous les
  // autres équipements `play` du catalogue.
  const { data: catalogue = [] } = useQuery({ queryKey: ["features"], queryFn: () => listFeatures(), enabled: open });
  const gameLabel = (code: string) => tc(`addPark.game.${code}`, { defaultValue: featureLabel(code) });

  const primary: GameOption[] = PRIMARY_GAME_CODES.map((code) => ({ code, label: gameLabel(code) }));
  const others: GameOption[] = useMemo(
    () =>
      catalogue
        .filter((c) => c.category === "play" && !(PRIMARY_GAME_CODES as readonly string[]).includes(c.code))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => ({ code: c.code, label: gameLabel(c.code) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogue, tc, featureLabel],
  );
  const known = new Set([...primary, ...others].map((g) => g.code));
  // Un jeu sélectionné absent du catalogue reste visible et retirable (jamais perdu).
  const orphans: GameOption[] = games.filter((c) => !known.has(c)).map((code) => ({ code, label: gameLabel(code) }));
  const allGames = [...primary, ...others, ...orphans];
  const extraSelected = [...others, ...orphans].filter((g) => games.includes(g.code));

  const pct = (v: number) => v / AGE_MAX;
  const ageValue =
    ageHigh >= AGE_MAX
      ? t("filters.ageValuePlus", { min: ageLow, max: AGE_MAX })
      : t("filters.ageValue", { min: ageLow, max: ageHigh });

  // Slider natif = beaucoup de `onChange` par glissement — `setAge` reste
  // appelé à chaque tick (comportement inchangé), seul l'événement analytics
  // est débounced sur la valeur finale.
  const ageTrackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (ageTrackTimer.current) clearTimeout(ageTrackTimer.current);
  }, []);
  function handleAgeChange(low: number, high: number) {
    setAge(low, high);
    if (ageTrackTimer.current) clearTimeout(ageTrackTimer.current);
    ageTrackTimer.current = setTimeout(() => {
      trackEvent("filter_applied", { filter_type: "age", filter_value: `${low}-${high >= AGE_MAX ? "12+" : high}` });
    }, AGE_FILTER_TRACK_DEBOUNCE_MS);
  }

  // "Ouvert maintenant" n'a aucun effet réel sur les résultats
  // (ANALYTICS-AUDIT.md §7) — volontairement PAS instrumenté comme un vrai
  // filtre appliqué, pour ne pas faire croire qu'il change quoi que ce soit.
  function handleToggleAmenity(key: keyof AmenityFilters) {
    toggleAmenity(key);
    trackEvent("filter_applied", { filter_type: "amenity", filter_value: key });
  }
  // Pas d'événement analytics pour les jeux : la taxonomie `filter_type` est figée.
  const handleToggleGame = toggleGame;

  function openGames() {
    setDraftGames(games);
    setQuery("");
    setView("games");
  }
  function validateGames() {
    setGames(draftGames);
    setView("main");
  }
  function toggleDraft(code: string) {
    setDraftGames((d) => (d.includes(code) ? d.filter((c) => c !== code) : [...d, code]));
  }

  // Réouverture : toujours sur la vue principale.
  useEffect(() => {
    if (!open) setView("main");
  }, [open]);

  // Au changement de vue, le focus va au titre (lecteurs d'écran / clavier).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    titleRef.current?.focus();
  }, [view]);

  // Échap : retour depuis « Tous les jeux », sinon fermeture.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (view === "games") setView("main");
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, view]);

  if (!open) return null;

  const inGames = view === "games";
  const visible = searchByLabel(allGames, query);
  const selectedCount = inGames ? draftGames.length : games.length;

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filters-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grabber} aria-hidden="true" />
        <header className={styles.header}>
          {inGames && (
            <button type="button" className={styles.iconBtn} onClick={() => setView("main")} aria-label={t("filters.back")}>
              <Icon name="ic-back" size={20} />
            </button>
          )}
          <h2 className={styles.title} id="filters-title" ref={titleRef} tabIndex={-1} data-centered={inGames ? "1" : undefined}>
            {inGames ? t("filters.allGamesTitle") : t("filters.title")}
          </h2>
          {inGames && selectedCount > 0 && <span className={styles.countPill}>{t("filters.selected", { count: selectedCount })}</span>}
          {!inGames && (
            <button type="button" className={styles.iconBtn} onClick={onClose} aria-label={t("filters.close")}>
              <Icon name="ic-close" size={20} />
            </button>
          )}
        </header>

        {inGames ? (
          <>
            <div className={styles.body}>
              <label className={styles.search}>
                <Icon name="ic-search" size={18} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("filters.searchGame")}
                  aria-label={t("filters.searchGame")}
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </label>
              <p className={styles.hint}>{t("filters.chooseGames")}</p>
              {visible.length === 0 ? (
                <p className={styles.empty} role="status">
                  {t("filters.noGame", { query: query.trim() })}
                </p>
              ) : (
                <div className={styles.grid3}>
                  {visible.map((g) => (
                    <ChoiceCard key={g.code} glyph={g.code} label={g.label} on={draftGames.includes(g.code)} onToggle={() => toggleDraft(g.code)} />
                  ))}
                </div>
              )}
            </div>
            <footer className={styles.footer}>
              <button type="button" className={styles.apply} onClick={validateGames}>
                {t("filters.validate")}
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className={styles.body}>
              <section className={styles.section} aria-labelledby="filters-age">
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionTitle} id="filters-age">
                    {t("filters.ageRange")}
                  </h3>
                  <span className={styles.countPill} aria-live="polite">
                    {ageValue}
                  </span>
                </div>
                <div className={styles.slider} style={{ "--lo": pct(ageLow), "--hi": pct(ageHigh) } as React.CSSProperties}>
                  <div className={styles.trackBg} />
                  <div className={styles.trackFill} />
                  <input type="range" min={0} max={AGE_MAX} step={1} value={ageLow} onChange={(e) => handleAgeChange(Math.min(Number(e.target.value), ageHigh), ageHigh)} aria-label={t("filters.ageMin")} />
                  <input type="range" min={0} max={AGE_MAX} step={1} value={ageHigh} onChange={(e) => handleAgeChange(ageLow, Math.max(Number(e.target.value), ageLow))} aria-label={t("filters.ageMax")} />
                </div>
                <div className={styles.ticks} aria-hidden="true">
                  {AGE_TICKS.map((v) => (
                    <span key={v} style={{ "--p": pct(v) } as React.CSSProperties}>
                      {v === AGE_MAX ? `${v}+` : v}
                    </span>
                  ))}
                </div>
              </section>

              <section className={styles.section} aria-labelledby="filters-games">
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionTitle} id="filters-games">
                    {t("filters.games")}
                  </h3>
                  {games.length > 0 && <span className={styles.countPill}>{t("filters.selected", { count: games.length })}</span>}
                </div>
                <div className={styles.grid3}>
                  {primary.map((g) => (
                    <ChoiceCard key={g.code} glyph={g.code} label={g.label} on={games.includes(g.code)} onToggle={() => handleToggleGame(g.code)} />
                  ))}
                </div>
                {extraSelected.length > 0 && (
                  <ul className={styles.chips}>
                    {extraSelected.map((g) => (
                      <li key={g.code}>
                        <button type="button" className={styles.chip} onClick={() => handleToggleGame(g.code)} aria-label={t("filters.remove", { label: g.label })}>
                          <ParkGlyph code={g.code} size={16} />
                          <span>{g.label}</span>
                          <Icon name="ic-close" size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className={styles.more} onClick={openGames}>
                  <Icon name="ic-list" size={18} />
                  <span>{t("filters.seeAllGames")}</span>
                  <Icon name="ic-back" size={16} style={{ transform: "rotate(180deg)" }} />
                </button>
              </section>

              <section className={styles.section} aria-labelledby="filters-availability">
                <h3 className={styles.sectionTitle} id="filters-availability">
                  {t("filters.availability")}
                </h3>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleGlyph} aria-hidden="true">
                    <Icon name="ic-clock" size={18} />
                  </span>
                  <span className={styles.toggleLabel} id="filters-open-now">
                    {t("filters.openNow")}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={openNow}
                    aria-labelledby="filters-open-now"
                    className={styles.switch}
                    data-on={openNow ? "1" : undefined}
                    onClick={() => setOpenNow(!openNow)}
                  >
                    <span className={styles.knob} />
                  </button>
                </div>
              </section>

              <section className={styles.section} aria-labelledby="filters-equipment">
                <h3 className={styles.sectionTitle} id="filters-equipment">
                  {t("filters.equipmentAccess")}
                </h3>
                <div className={styles.grid3}>
                  {AMENITY_KEYS.map((key) => (
                    <ChoiceCard key={key} glyph={key} label={t(`filters.amenity.${key}`)} on={amenities[key]} onToggle={() => handleToggleAmenity(key)} />
                  ))}
                </div>
              </section>
            </div>

            <footer className={styles.footer}>
              <button type="button" className={styles.reset} onClick={reset}>
                {t("filters.reset")}
              </button>
              <button type="button" className={styles.apply} onClick={onClose}>
                {t("filters.apply")}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
