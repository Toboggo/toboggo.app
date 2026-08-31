import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState } from "@toboggo/design-system";
import { listParksByIds } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
import { BottomTabs } from "../../components/BottomTabs";
import { ParkCard } from "../../components/ParkCard";
import { useSession } from "../../lib/session";

export default function Favorites() {
  const navigate = useNavigate();
  const favorites = useSession((s) => s.profile?.favorites ?? []);
  const patchProfile = useSession((s) => s.patchProfile);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: parks = [] } = useQuery({
    queryKey: ["favorite-parks", favorites],
    queryFn: () => listParksByIds(favorites),
  });

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  }

  return (
    <div className="screen screen-with-tabs">
      <TopBar
        title="Favoris"
        onBack={() => navigate("/map")}
        right={
          parks.length > 0 ? (
            <button
              onClick={() => setCompareMode((c) => !c)}
              style={{ background: "none", border: "none", color: "var(--color-primary)", fontFamily: "var(--font-heading)", fontWeight: 600, cursor: "pointer" }}
            >
              {compareMode ? "Annuler" : "Comparer"}
            </button>
          ) : null
        }
      />
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {parks.length === 0 ? (
          <EmptyState iconName="ic-heart" title="Aucun parc favori pour le moment." description="Appuyez sur le cœur d'un parc pour l'ajouter ici." />
        ) : (
          parks.map((park) =>
            compareMode ? (
              <label
                key={park.id}
                style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--color-surface)", borderRadius: 14, padding: 10 }}
              >
                <input type="checkbox" checked={selected.has(park.id)} onChange={() => toggleSelect(park.id)} />
                <div style={{ flex: 1 }}>
                  <ParkCard park={park} />
                </div>
              </label>
            ) : (
              <ParkCard
                key={park.id}
                park={park}
                favorite
                onToggleFavorite={() => void patchProfile({ favorites: favorites.filter((f) => f !== park.id) })}
              />
            ),
          )
        )}
      </div>

      {compareMode && selected.size >= 2 && (
        <div style={{ position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", zIndex: 40 }}>
          <Button onClick={() => navigate(`/compare?ids=${Array.from(selected).join(",")}`)}>
            Comparer ({selected.size})
          </Button>
        </div>
      )}

      <BottomTabs />
    </div>
  );
}
