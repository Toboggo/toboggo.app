import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BottomSheet } from "@toboggo/design-system";
import { WEATHER_ALERT_COPY } from "@toboggo/shared";
import { MapCanvas } from "./MapCanvas";
import { SearchOverlay } from "./SearchOverlay";
import { FiltersSheet } from "./FiltersSheet";
import { ParkPreview } from "./ParkPreview";
import { ParkList } from "./ParkList";
import { BottomTabs } from "../../components/BottomTabs";
import { QuickMenu } from "../../components/QuickMenu";
import { useGeo, requestBrowserLocation } from "../../lib/geo";
import { useFilters } from "../../lib/filters";
import { useNearbyParks } from "../../lib/parksQuery";
import { useWeather } from "../../lib/weather";
import { useSession } from "../../lib/session";
import styles from "./MapExplore.module.css";

function weatherEmoji(condition?: string) {
  return condition === "rain" ? "🌧️" : condition === "heat" ? "☀️" : condition === "wind" ? "💨" : "⛅";
}

export default function MapExplore() {
  const navigate = useNavigate();
  const { lat, lng, label } = useGeo();
  const { ageLow, ageHigh, amenities, activeCount } = useFilters();
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [forChildren, setForChildren] = useState(false);
  const [weatherDismissed, setWeatherDismissed] = useState(false);

  const userId = useSession((s) => s.userId);
  const favorites = useSession((s) => s.profile?.favorites ?? []);
  const patchProfile = useSession((s) => s.patchProfile);

  const { data: parks = [], isLoading } = useNearbyParks({
    lat,
    lng,
    ageMin: ageLow,
    ageMax: ageHigh,
    amenities,
  });
  const { data: weather } = useWeather(lat, lng);

  const selectedPark = parks.find((p) => p.id === selectedId) ?? null;
  const count = activeCount();

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

  return (
    <div className={styles.screen}>
      <MapCanvas
        lat={lat}
        lng={lng}
        parks={parks}
        selectedId={selectedId}
        onSelect={setSelectedId}
        recenterSignal={recenterSignal}
      />

      <div className={styles.searchBar}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A8578" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          readOnly
          placeholder="Rechercher un parc, une ville…"
          value={label && label !== "Autour de vous" ? label : ""}
          onFocus={() => setSearchOpen(true)}
          onClick={() => setSearchOpen(true)}
        />
        {weather && (
          <button type="button" className={styles.weatherChip} onClick={() => navigate("/map")}>
            <span>{weatherEmoji(weather.condition)}</span>
            <span>{Math.round(weather.temperatureC)}°</span>
          </button>
        )}
        <button type="button" className={styles.iconBtn} data-on={count > 0 ? "1" : undefined} onClick={() => setFiltersOpen(true)} aria-label="Filtres">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <line x1="4" y1="7" x2="20" y2="7" />
            <circle cx="9" cy="7" r="2" />
            <line x1="4" y1="17" x2="20" y2="17" />
            <circle cx="16" cy="17" r="2" />
          </svg>
          {count > 0 && <span className={styles.badge}>{count}</span>}
        </button>
        <button type="button" className={styles.iconBtn} onClick={() => navigate("/notifications/center")} aria-label="Notifications">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
      </div>

      {alertCopy && !weatherDismissed && (
        <div className={styles.weatherAlert}>
          <span className={styles.waIcon}>{weatherEmoji(weather?.condition)}</span>
          <div className={styles.waBody}>
            <div className={styles.waText}>{alertCopy.message}</div>
            <button type="button" onClick={() => setFiltersOpen(true)}>
              {alertCopy.actionLabel}
            </button>
          </div>
          <button type="button" className={styles.waClose} onClick={() => setWeatherDismissed(true)} aria-label="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
        </div>
      )}

      <div className={styles.fabStack}>
        <button type="button" className={styles.fabAdd} onClick={() => setQuickMenuOpen(true)} aria-label="Ajouter">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button type="button" className={styles.fabRecenter} onClick={() => void handleRecenter()} aria-label="Recentrer">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#24303A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="5" />
          </svg>
        </button>
      </div>

      <BottomSheet open onClose={() => setSelectedId(null)} snapPoints={[210, 360, 620]} bottomInset={78}>
        {selectedPark ? (
          <ParkPreview
            park={selectedPark}
            distanceM={selectedPark.distance_m}
            onToggleFavorite={() => toggleFavorite(selectedPark.id)}
            onBack={() => setSelectedId(null)}
          />
        ) : isLoading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>Chargement des parcs…</div>
        ) : (
          <ParkList parks={parks} onToggleFavorite={toggleFavorite} forChildren={forChildren} setForChildren={setForChildren} />
        )}
      </BottomSheet>

      <BottomTabs />

      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          onSelectPark={(id) => {
            setSearchOpen(false);
            setSelectedId(id);
          }}
          onSelectCity={(city) => {
            setSearchOpen(false);
            useGeo.getState().setLocation(city.lat, city.lng, city.name);
            setRecenterSignal((n) => n + 1);
          }}
        />
      )}

      <FiltersSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} />
      <QuickMenu open={quickMenuOpen} onClose={() => setQuickMenuOpen(false)} />
    </div>
  );
}
