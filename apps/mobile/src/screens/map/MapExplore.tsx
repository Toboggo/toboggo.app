import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BottomSheet, Icon, useBottomNavHeight, useViewportHeight, type Snap } from "@toboggo/design-system";
import { MapCanvas } from "./MapCanvas";
import { SearchOverlay } from "./SearchOverlay";
import { FiltersSheet } from "./FiltersSheet";
import { ParkPreview } from "./ParkPreview";
import { ParkList } from "./ParkList";
import { ParkCarousel } from "./ParkCarousel";
import { selectContextualCarousel } from "./contextualCarousel";
import { SheetState, SheetLoading } from "./SheetState";
import { BottomTabs } from "../../components/BottomTabs";
import { QuickMenu } from "../../components/QuickMenu";
import { useGeo, requestBrowserLocation, DEFAULT_GEO_LABEL } from "../../lib/geo";
import { useFilters } from "../../lib/filters";
import { useChildAges } from "../../lib/children";
import { useNearbyParks } from "../../lib/parksQuery";
import { useWeather } from "../../lib/weather";
import { useSession } from "../../lib/session";
import styles from "./MapExplore.module.css";

// Peek height (px): header + hint, then ~30-40% of the first card row height
// showing through — a real "there's more below" affordance (Maps/Plans-style
// peek principle, not their visuals) rather than a title-only bar. Fixed, not
// "fit": we deliberately crop the carousel short instead of hugging it.
const PEEK_H = 137;

// Medium is a real "map + discovery" balance, not a near-full sheet: a fixed
// share of the zone actually available between the header and the bottom nav
// (not of the raw viewport — a fraction snap resolves against the full screen
// height, see `BottomSheet.resolve`), so it stays proportionate across phones
// instead of hardcoding one device's numbers. Sized a bit past the contextual
// block's own height so "Tous les parcs autour de vous" starts to peek in
// underneath it (cropped, not scrollable yet — see `renderSheet`) instead of
// snap 1 hard-stopping right at the carousel's edge.
const MEDIUM_RATIO = 0.53;

const SNAPS_SINGLE: Snap[] = ["fit"];

function weatherEmoji(condition?: string) {
  return condition === "rain" ? "🌧️" : condition === "heat" ? "☀️" : condition === "wind" ? "💨" : "⛅";
}

const WEATHER_ALERT_CONDITIONS = ["heat", "rain", "wind"] as const;
type WeatherAlertCondition = (typeof WEATHER_ALERT_CONDITIONS)[number];
function isWeatherAlertCondition(c: string | undefined): c is WeatherAlertCondition {
  return (WEATHER_ALERT_CONDITIONS as readonly string[]).includes(c ?? "");
}

export default function MapExplore() {
  const navigate = useNavigate();
  const { t } = useTranslation("map");
  const { lat, lng, label, permission, hasFix } = useGeo();
  const { ageLow, ageHigh, amenities, activeCount, reset } = useFilters();
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [forChildren, setForChildren] = useState(false);
  const [weatherDismissed, setWeatherDismissed] = useState(false);
  // Compact by default — the map is the point of this screen, so it opens
  // with just the "Autour de vous" bar, not the carousel already expanded.
  const [snap, setSnap] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(280);
  // Real rendered height of the bottom nav (content + iOS home-indicator safe
  // area), from the shared CSS token. Replaces the old `TAB_INSET = 78` guess so
  // the sheet, the map camera insets and the nav can't disagree.
  const navH = useBottomNavHeight();
  const vpH = useViewportHeight();
  const [headerBottom, setHeaderBottom] = useState(72);
  const headerRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const userId = useSession((s) => s.userId);
  const favorites = useSession((s) => s.profile?.favorites ?? []);
  const toggleFavoriteAction = useSession((s) => s.toggleFavorite);
  const childAges = useChildAges();

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

  // The one carousel shown under the filters — same selection at every list
  // snap, see `renderSheet`.
  const contextual = useMemo(
    () => selectContextualCarousel(parks, favorites, forChildren, childAges),
    [parks, favorites, forChildren, childAges],
  );

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
  // Medium is a fixed px share of the zone actually available to the sheet
  // (viewport minus the header/search-bar strip minus the bottom nav) — the
  // same ingredients `BottomSheet`'s own `maxH` clamps against (`topInset` /
  // `bottomInset` below), so it tracks every device instead of one phone.
  const snapPoints = useMemo<Snap[]>(() => {
    if (mode !== "list") return SNAPS_SINGLE;
    const usefulZoneH = vpH - (headerBottom + 12) - navH;
    const mediumH = Math.round(usefulZoneH * MEDIUM_RATIO);
    return [PEEK_H, mediumH, 0.9];
  }, [mode, vpH, headerBottom, navH]);

  // Reset the snap position when the mode *changes* so the new ladder starts
  // sane — but don't fight the user's drag while they stay in the same mode.
  // Landing back on "list" (e.g. after closing a preview, or a fresh search)
  // goes to the compact bar (0), not the carousel — same "more map, less
  // chrome" default as the initial mount.
  const prevMode = useRef(mode);
  useEffect(() => {
    if (prevMode.current === mode) return;
    prevMode.current = mode;
    setSnap(0);
  }, [mode]);

  // A deliberate tap on the map background (never a pan/zoom/marker tap — see
  // MapCanvas/FakeMap's own `onBackgroundTap`). A selected park is deselected,
  // which already collapses the sheet to peek via the mode-change effect
  // above; otherwise, with no park selected, the sheet's own medium/expanded
  // snap is brought back to peek directly.
  function handleMapBackgroundTap() {
    if (selectedId) {
      setSelectedId(null);
    } else if (snap !== 0) {
      setSnap(0);
    }
  }

  function toggleFavorite(parkId: string) {
    if (!userId) {
      navigate("/login");
      return;
    }
    toggleFavoriteAction(parkId);
  }

  async function handleRecenter() {
    try {
      const pos = await requestBrowserLocation();
      const { setLocation, setPermission } = useGeo.getState();
      setLocation(pos.lat, pos.lng, DEFAULT_GEO_LABEL);
      setPermission("granted");
      setRecenterSignal((n) => n + 1);
    } catch {
      useGeo.getState().setPermission("denied");
    }
  }

  const alertCondition = weather && isWeatherAlertCondition(weather.condition) ? weather.condition : null;
  const alertCopy = alertCondition
    ? {
        message: t(`weather.${alertCondition}Message`),
        actionLabel: t(`weather.${alertCondition}Action`),
      }
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

  const placeLabel = label && label !== DEFAULT_GEO_LABEL ? label : null;
  const sheetTopInset = headerBottom + 12;
  // Deterministic: the floating controls belong to the map browsing states, not
  // to a full-height list or a park preview. No height guessing.
  const showFabs = mode === "preview" ? false : mode === "list" ? snap < 2 : true;
  const fabBottom = navH + sheetHeight + 12;
  // The map's usable area is the strip between the floating header and the top
  // of the bottom sheet — MapLibre `padding` keeps the camera centred there.
  const mapInsets = useMemo(
    () => ({ top: headerBottom + 8, bottom: navH + sheetHeight }),
    [headerBottom, sheetHeight, navH],
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
          title={t("state.errorTitle")}
          description={t("state.errorDesc")}
          action={
            <button type="button" className={styles.stateBtn} onClick={() => void refetch()}>
              {t("action.retry", { ns: "common" })}
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
            title={t("state.locationOffTitle")}
            description={t("state.locationOffDesc")}
            action={
              <button type="button" className={styles.stateBtn} onClick={() => void handleRecenter()}>
                {t("state.locationOffAction")}
              </button>
            }
          />
        );
      }
      if (filterCount > 0) {
        return (
          <SheetState
            iconName="ic-slide"
            title={t("state.filtersTitle")}
            description={t("state.filtersDesc")}
            action={
              <button type="button" className={styles.stateBtn} onClick={reset}>
                {t("state.filtersAction")}
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
            title={t("state.placeTitle")}
            description={t("state.placeDesc")}
            action={
              <button type="button" className={styles.stateBtn} onClick={() => setSearchOpen(true)}>
                {t("state.placeAction")}
              </button>
            }
          />
        );
      }
      return (
        <SheetState
          iconName="ic-slide"
          title={t("state.aroundTitle")}
          description={t("state.aroundDesc")}
          action={
            <button type="button" className={styles.stateBtn} onClick={() => setSearchOpen(true)}>
              {t("state.aroundAction")}
            </button>
          }
        />
      );
    }

    // One header shape across every snap — same title anchor, same row
    // layout — only the trailing slot's content changes (the count at peek,
    // the "Voir tout" jump at medium, the count again once expanded). Sharing
    // this single block is what makes peek → medium → expanded read as one
    // panel deploying rather than three different headers swapping in. Peek
    // shows the plain count — the handle alone is the "you can drag this"
    // affordance, no extra copy needed.
    const header = (
      <div className={styles.sheetHead}>
        <div className={styles.sheetTitle}>{t("sheet.aroundYou")}</div>
        {snap === 0 ? (
          <span className={styles.count}>{t("sheet.count", { count: parks.length })}</span>
        ) : snap === 1 ? (
          <button type="button" className={styles.seeAll} onClick={() => setSnap(2)}>
            {t("action.seeAll", { ns: "common" })}
          </button>
        ) : (
          <span className={styles.count}>{t("sheet.count", { count: parks.length })}</span>
        )}
      </div>
    );

    // `contextual` is never null here — `hasResults` above already guarantees
    // `parks.length > 0`, the only case `selectContextualCarousel` returns null.
    // Peek: a minimal, coherent preview — the same contextual selection medium
    // and expanded show (not a different "every nearby park" strip), but
    // without stacking a second title in an already tight crop (PEEK_H).
    if (snap === 0) {
      return (
        <div className={styles.intermediate}>
          {header}
          <ParkCarousel
            parks={contextual?.parks ?? []}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onSelect={setSelectedId}
            cardVariant="peek"
          />
        </div>
      );
    }

    // Medium and expanded both lead with the full contextual block (children >
    // favorites nearby > discover) under its own title — so opening the sheet
    // further reads as more of the same view, not a jump to a different screen.
    const contextualBlock = contextual && (
      <div className={styles.intermediate}>
        {header}
        <div className={styles.contextualHead}>
          <div className={styles.sheetTitle}>{t(contextual.titleKey)}</div>
          <div className={styles.contextualSubtitle}>{t(contextual.subtitleKey)}</div>
        </div>
        <ParkCarousel
          parks={contextual.parks}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onSelect={setSelectedId}
        />
      </div>
    );

    // Medium and expanded share this exact same tree — the "Tous les parcs
    // autour de vous" list header starts right after the carousel in both.
    // At medium the sheet's own fixed height (non-scrollable there, see
    // BottomSheet's canScroll) simply crops it, so only the top of that
    // heading peeks into view — the same "there's more below" affordance as
    // the carousel itself, rather than a hard stop after the contextual
    // block. Expanded then reveals (and makes scrollable) the rest of the
    // list. Parks already shown in the carousel are pushed after the rest
    // there (never removed), so a park isn't immediately repeated in the
    // first rows.
    const contextualIds = contextual ? contextual.parks.map((p) => p.id) : [];
    return (
      <>
        {contextualBlock}
        <ParkList
          parks={parks}
          onToggleFavorite={toggleFavorite}
          forChildren={forChildren}
          setForChildren={setForChildren}
          header={
            <div className={styles.sheetHead}>
              <div className={styles.sheetTitle}>{t("sheet.allNearby")}</div>
            </div>
          }
          contextualIds={contextualIds}
        />
      </>
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
        onBackgroundTap={handleMapBackgroundTap}
        recenterSignal={recenterSignal}
        showUser={permission === "granted"}
        insets={mapInsets}
      />

      <div className={styles.searchBar} ref={headerRef}>
        <button type="button" className={styles.searchField} onClick={() => setSearchOpen(true)}>
          <Icon name="ic-explore" size={16} style={{ color: "var(--color-text-muted)" }} />
          <span className={placeLabel ? styles.searchValue : styles.searchPlaceholder}>
            {placeLabel ?? t("searchPlaceholder")}
          </span>
        </button>
        {weather && (
          <div
            className={styles.weatherChip}
            aria-label={t("weather.aria", { temp: Math.round(weather.temperatureC) })}
          >
            <span>{weatherEmoji(weather.condition)}</span>
            <span>{Math.round(weather.temperatureC)}°</span>
          </div>
        )}
        <button
          type="button"
          className={styles.iconBtn}
          data-on={filterCount > 0 ? "1" : undefined}
          onClick={() => setFiltersOpen(true)}
          aria-label={t("filters.open")}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <line x1="4" y1="7" x2="20" y2="7" />
            <circle cx="9" cy="7" r="2" />
            <line x1="4" y1="17" x2="20" y2="17" />
            <circle cx="16" cy="17" r="2" />
          </svg>
          {filterCount > 0 && <span className={styles.badge}>{filterCount}</span>}
        </button>
        <button type="button" className={styles.iconBtn} onClick={() => navigate("/notifications/center")} aria-label={t("a11y.notifications")}>
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
          <button type="button" className={styles.waClose} onClick={() => setWeatherDismissed(true)} aria-label={t("action.close", { ns: "common" })}>
            <Icon name="ic-close" size={14} />
          </button>
        </div>
      )}

      {showFabs && (
        <div className={styles.fabStack} style={{ bottom: fabBottom }}>
          <button type="button" className={styles.fabRecenter} onClick={() => void handleRecenter()} aria-label={t("a11y.recenter")}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text)" }} aria-hidden>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <button type="button" className={styles.fabAdd} onClick={() => setQuickMenuOpen(true)} aria-label={t("a11y.contribute")}>
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
        bottomInset={navH}
        topInset={sheetTopInset}
        floating
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
