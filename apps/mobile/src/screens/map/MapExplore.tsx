import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BottomSheet, Icon, type Snap } from "@toboggo/design-system";
import { WEATHER_ALERT_COPY } from "@toboggo/shared";
import { MapCanvas } from "./MapCanvas";
import { SearchOverlay } from "./SearchOverlay";
import { FiltersSheet } from "./FiltersSheet";
import { ParkPreview } from "./ParkPreview";
import { ParkList } from "./ParkList";
import { ParkCarousel } from "./ParkCarousel";
import { SheetState, SheetLoading } from "./SheetState";
import { BottomTabs } from "../../components/BottomTabs";
import { QuickMenu } from "../../components/QuickMenu";
import { useGeo, requestBrowserLocation } from "../../lib/geo";
import { useFilters } from "../../lib/filters";
import { useNearbyParks } from "../../lib/parksQuery";
import { useWeather } from "../../lib/weather";
import { useSession } from "../../lib/session";
import styles from "./MapExplore.module.css";

const TAB_INSET = 78;
// Snap ladders per sheet mode. "fit" = hug the measured content (no empty panel);
// 0.9 = near-fullscreen expanded (further clamped so it never covers the header).
const SNAPS_LIST: Snap[] = ["fit", "fit", 0.9];
const SNAPS_SINGLE: Snap[] = ["fit"];

function weatherEmoji(condition?: string) {
  return condition === "rain" ? "🌧️" : condition === "heat" ? "☀️" : condition === "wind" ? "💨" : "⛅";
}

export default function MapExplore() {
  const navigate = useNavigate();
  const { lat, lng, label, permission, hasFix } = useGeo();
  const { ageLow, ageHigh, amenities, activeCount, reset } = useFilters();
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [forChildren, setForChildren] = useState(false);
  const [weatherDismissed, setWeatherDismissed] = useState(false);
  const [snap, setSnap] = useState(1);
  const [sheetHeight, setSheetHeight] = useState(280);
  const [headerBottom, setHeaderBottom] = useState(72);
  const headerRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const userId = useSession((s) => s.userId);
  const favorites = useSession((s) => s.profile?.favorites ?? []);
  const patchProfile = useSession((s) => s.patchProfile);

  const {
    data: parks = [],
    isLoading,
    isError,
    refetch,
  } = useNearbyParks({ lat, lng, ageMin: ageLow, ageMax: ageHigh, amenities });
  const { data: weather } = useWeather(lat, lng);

  const selectedPark = parks.find((p) => p.id === selectedId) ?? null;
  const filterCount = activeCount();
  const hasResults = parks.length > 0;

  const mode: "preview" | "loading" | "state" | "list" = selectedPark
    ? "preview"
    : isLoading
      ? "loading"
      : isError || !hasResults
        ? "state"
        : "list";

  // Each mode has its own snap ladder so the sheet is always sized to its
  // content — a one-line status or a short carousel never leaves an empty
  // panel, and the list mode can still be pulled up to (near-)fullscreen.
  const snapPoints = useMemo<Snap[]>(() => (mode === "list" ? SNAPS_LIST : SNAPS_SINGLE), [mode]);

  // Reset the snap position when the mode *changes* so the new ladder starts
  // sane — but don't fight the user's drag while they stay in the same mode.
  const prevMode = useRef(mode);
  useEffect(() => {
    if (prevMode.current === mode) return;
    prevMode.current = mode;
    setSnap(mode === "list" ? 1 : 0);
  }, [mode]);

  function toggleFavorite(parkId: string) {
    if (!userId) {
      navigate("/login");
      return;
    }
    const next = favorites.includes(parkId) ? favorites.filter((f) => f !== parkId) : [...favorites, parkId];
    void patchProfile({ favorites: next });
  }

  async function handleRecenter() {
    try {
      const pos = await requestBrowserLocation();
      const { setLocation, setPermission } = useGeo.getState();
      setLocation(pos.lat, pos.lng, "Autour de vous");
      setPermission("granted");
      setRecenterSignal((n) => n + 1);
    } catch {
      useGeo.getState().setPermission("denied");
    }
  }

  const alertCopy =
    weather && weather.condition in WEATHER_ALERT_COPY
      ? WEATHER_ALERT_COPY[weather.condition as keyof typeof WEATHER_ALERT_COPY]
      : null;
  const alertShown = !!alertCopy && !weatherDismissed;

  // On first open, ask for the real position so "Autour de vous" is genuinely
  // around the user (not the Lyon default). Skipped once we already have a fix
  // (GPS or an explicit city pick) or the user has refused.
  const geoAsked = useRef(false);
  useEffect(() => {
    if (geoAsked.current || hasFix || permission === "denied") return;
    geoAsked.current = true;
    void handleRecenter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the sheet's ceiling just below the floating header (search bar, and the
  // weather banner when it's showing) — measured, not hardcoded to one viewport.
  useLayoutEffect(() => {
    const measure = () => {
      const h = headerRef.current?.getBoundingClientRect().bottom ?? 0;
      const a = alertRef.current?.getBoundingClientRect().bottom ?? 0;
      setHeaderBottom(Math.round(Math.max(h, a)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (headerRef.current) ro.observe(headerRef.current);
    if (alertRef.current) ro.observe(alertRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [alertShown]);

  const placeLabel = label && label !== "Autour de vous" ? label : null;
  const sheetTopInset = headerBottom + 12;
  // Deterministic: the floating controls belong to the map browsing states, not
  // to a full-height list or a park preview. No height guessing.
  const showFabs = mode === "preview" ? false : mode === "list" ? snap < 2 : true;
  const fabBottom = TAB_INSET + sheetHeight + 12;
  // The map's usable area is the strip between the floating header and the top
  // of the bottom sheet — MapLibre `padding` keeps the camera centred there.
  const mapInsets = useMemo(
    () => ({ top: headerBottom + 8, bottom: TAB_INSET + sheetHeight }),
    [headerBottom, sheetHeight],
  );

  function renderSheet() {
    if (selectedPark) {
      return (
        <ParkPreview
          park={selectedPark}
          distanceM={selectedPark.distance_m}
          onToggleFavorite={() => toggleFavorite(selectedPark.id)}
          onBack={() => setSelectedId(null)}
        />
      );
    }
    if (isLoading) return <SheetLoading />;
    if (isError) {
      return (
        <SheetState
          tone="error"
          iconName="ic-close"
          title="Impossible de charger les parcs"
          description="La connexion au service a échoué. Vérifiez votre réseau et réessayez."
          action={
            <button type="button" className={styles.stateBtn} onClick={() => void refetch()}>
              Réessayer
            </button>
          }
        />
      );
    }
    if (!hasResults) {
      if (permission === "denied") {
        return (
          <SheetState
            iconName="ic-explore"
            title="Localisation désactivée"
            description="Autorisez la localisation ou cherchez une ville pour voir les parcs autour de vous."
            action={
              <button type="button" className={styles.stateBtn} onClick={() => void handleRecenter()}>
                Activer la localisation
              </button>
            }
          />
        );
      }
      if (filterCount > 0) {
        return (
          <SheetState
            iconName="ic-slide"
            title="Aucun parc avec ces filtres"
            description="Élargissez la tranche d’âge ou retirez des critères pour voir plus de parcs."
            action={
              <button type="button" className={styles.stateBtn} onClick={reset}>
                Effacer les filtres
              </button>
            }
          />
        );
      }
      // Une destination recherchée est active (ville/lieu géocodé) — "Aucun parc
      // autour de vous" serait trompeur puisque l'utilisateur ne regarde plus sa
      // propre position. La carte reste sur la destination, sans retour forcé au GPS.
      if (placeLabel) {
        return (
          <SheetState
            iconName="ic-slide"
            title="Aucun parc ici"
            description="Aucun parc référencé dans cette zone pour le moment."
            action={
              <button type="button" className={styles.stateBtn} onClick={() => setSearchOpen(true)}>
                Chercher un autre lieu
              </button>
            }
          />
        );
      }
      return (
        <SheetState
          iconName="ic-slide"
          title="Aucun parc autour de vous"
          description="Aucune aire de jeux référencée dans cette zone pour le moment."
          action={
            <button type="button" className={styles.stateBtn} onClick={() => setSearchOpen(true)}>
              Chercher une ville
            </button>
          }
        />
      );
    }

    const header = (
      <div className={styles.sheetHead}>
        <div className={styles.sheetTitle}>Autour de vous</div>
        {snap < 2 ? (
          <button type="button" className={styles.seeAll} onClick={() => setSnap(2)}>
            Voir tout
          </button>
        ) : (
          <span className={styles.count}>{parks.length} parcs</span>
        )}
      </div>
    );

    if (snap === 0) {
      return (
        <button type="button" className={styles.collapsedBar} onClick={() => setSnap(1)}>
          <span className={styles.sheetTitle}>Autour de vous</span>
          <span className={styles.count}>
            {parks.length} parc{parks.length > 1 ? "s" : ""} · Faites glisser pour explorer
          </span>
        </button>
      );
    }

    if (snap === 1) {
      return (
        <div className={styles.intermediate}>
          {header}
          <ParkCarousel
            parks={parks}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onSelect={setSelectedId}
          />
        </div>
      );
    }

    return (
      <ParkList
        parks={parks}
        onToggleFavorite={toggleFavorite}
        forChildren={forChildren}
        setForChildren={setForChildren}
        header={header}
      />
    );
  }

  return (
    <div className={styles.screen}>
      <MapCanvas
        lat={lat}
        lng={lng}
        parks={parks}
        selectedId={selectedId}
        onSelect={setSelectedId}
        recenterSignal={recenterSignal}
        showUser={permission === "granted"}
        insets={mapInsets}
      />

      <div className={styles.searchBar} ref={headerRef}>
        <button type="button" className={styles.searchField} onClick={() => setSearchOpen(true)}>
          <Icon name="ic-explore" size={16} style={{ color: "var(--color-text-muted)" }} />
          <span className={placeLabel ? styles.searchValue : styles.searchPlaceholder}>
            {placeLabel ?? "Rechercher un parc, une ville…"}
          </span>
        </button>
        {weather && (
          <div className={styles.weatherChip} aria-label={`Météo ${Math.round(weather.temperatureC)} degrés`}>
            <span>{weatherEmoji(weather.condition)}</span>
            <span>{Math.round(weather.temperatureC)}°</span>
          </div>
        )}
        <button
          type="button"
          className={styles.iconBtn}
          data-on={filterCount > 0 ? "1" : undefined}
          onClick={() => setFiltersOpen(true)}
          aria-label="Filtres"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <line x1="4" y1="7" x2="20" y2="7" />
            <circle cx="9" cy="7" r="2" />
            <line x1="4" y1="17" x2="20" y2="17" />
            <circle cx="16" cy="17" r="2" />
          </svg>
          {filterCount > 0 && <span className={styles.badge}>{filterCount}</span>}
        </button>
        <button type="button" className={styles.iconBtn} onClick={() => navigate("/notifications/center")} aria-label="Notifications">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
      </div>

      {alertShown && (
        <div className={styles.weatherAlert} ref={alertRef}>
          <span className={styles.waIcon}>{weatherEmoji(weather?.condition)}</span>
          <div className={styles.waBody}>
            <div className={styles.waText}>{alertCopy.message}</div>
            <button type="button" onClick={() => setFiltersOpen(true)}>
              {alertCopy.actionLabel}
            </button>
          </div>
          <button type="button" className={styles.waClose} onClick={() => setWeatherDismissed(true)} aria-label="Fermer">
            <Icon name="ic-close" size={14} />
          </button>
        </div>
      )}

      {showFabs && (
        <div className={styles.fabStack} style={{ bottom: fabBottom }}>
          <button type="button" className={styles.fabRecenter} onClick={() => void handleRecenter()} aria-label="Recentrer">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text)" }} aria-hidden>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <button type="button" className={styles.fabAdd} onClick={() => setQuickMenuOpen(true)} aria-label="Contribuer">
            <Icon name="ic-plus" size={22} />
          </button>
        </div>
      )}

      <BottomSheet
        // Remount on mode change: forces the sheet's internal drag/height state
        // (in particular `liveH`, which only clears on a deferred rAF) to reset
        // in lockstep with the new snapPoints ladder and content, instead of
        // momentarily rendering the new (shorter) content at a stale height.
        key={mode}
        open
        dismissible={mode === "preview"}
        onClose={() => setSelectedId(null)}
        onOverswipeUp={
          mode === "preview" && selectedPark ? () => navigate(`/park/${selectedPark.id}`) : undefined
        }
        snapPoints={snapPoints}
        snapIndex={snap}
        onSnapChange={setSnap}
        onHeightChange={setSheetHeight}
        bottomInset={TAB_INSET}
        topInset={sheetTopInset}
      >
        {renderSheet()}
      </BottomSheet>

      <BottomTabs />

      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          onSelectPark={(id) => {
            setSearchOpen(false);
            setSelectedId(id);
          }}
          onSelectPlace={(place) => {
            setSearchOpen(false);
            useGeo.getState().setLocation(place.lat, place.lng, place.name);
            setRecenterSignal((n) => n + 1);
          }}
        />
      )}

      <FiltersSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} />
      <QuickMenu open={quickMenuOpen} onClose={() => setQuickMenuOpen(false)} />
    </div>
  );
}
