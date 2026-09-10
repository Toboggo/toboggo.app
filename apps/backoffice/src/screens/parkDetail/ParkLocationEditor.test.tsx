import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { mapStyleUrl } from "@toboggo/shared";
import { ParkLocationEditor } from "./ParkLocationEditor";

// ── MapLibre : mock léger, sans WebGL ni réseau ─────────────────────────────
vi.mock("maplibre-gl", () => {
  class Evented {
    handlers: Record<string, ((e?: unknown) => void)[]> = {};
    on(ev: string, cb: (e?: unknown) => void) {
      (this.handlers[ev] ||= []).push(cb);
      return this;
    }
    fire(ev: string, e?: unknown) {
      (this.handlers[ev] || []).forEach((cb) => cb(e));
    }
  }
  class FakeMap extends Evented {
    center: [number, number] = [0, 0];
    zoom = 5;
    flyToCalls: { center: [number, number]; zoom?: number }[] = [];
    constructor(opts: { center?: [number, number] }) {
      super();
      if (opts?.center) this.center = opts.center;
      instances.maps.push(this);
    }
    addControl() {
      return this;
    }
    setCenter(c: [number, number]) {
      this.center = c;
      return this;
    }
    flyTo(o: { center: [number, number]; zoom?: number }) {
      this.center = o.center;
      if (o.zoom != null) this.zoom = o.zoom;
      this.flyToCalls.push(o);
      return this;
    }
    remove() {}
  }
  class FakeMarker extends Evented {
    lngLat = { lng: 0, lat: 0 };
    draggable = false;
    constructor(opts?: { draggable?: boolean }) {
      super();
      this.draggable = !!opts?.draggable;
      instances.markers.push(this);
    }
    setLngLat(v: [number, number] | { lng: number; lat: number }) {
      this.lngLat = Array.isArray(v) ? { lng: v[0], lat: v[1] } : v;
      return this;
    }
    getLngLat() {
      return this.lngLat;
    }
    setDraggable(d: boolean) {
      this.draggable = d;
      return this;
    }
    isDraggable() {
      return this.draggable;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  const instances: { maps: FakeMap[]; markers: FakeMarker[] } = { maps: [], markers: [] };
  return {
    __esModule: true,
    default: { Map: FakeMap, Marker: FakeMarker, NavigationControl: class {} },
    __instances: instances,
  };
});

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, mapStyleUrl: vi.fn(() => "https://example.test/style.json") };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mapInstances(): Promise<{ maps: any[]; markers: any[] }> {
  return (await import("maplibre-gl") as unknown as { __instances: { maps: unknown[]; markers: unknown[] } })
    .__instances as never;
}

function Harness({
  editing = true,
  lat0 = "44.100000",
  lng0 = "3.070000",
  onChange,
}: {
  editing?: boolean;
  lat0?: string;
  lng0?: string;
  onChange?: (la: string, lo: string) => void;
}) {
  const [lat, setLat] = useState(lat0);
  const [lng, setLng] = useState(lng0);
  return (
    <ParkLocationEditor
      editing={editing}
      latitude={lat}
      longitude={lng}
      onChange={(la, lo) => {
        setLat(la);
        setLng(lo);
        onChange?.(la, lo);
      }}
    />
  );
}

describe("ParkLocationEditor (Lot 3C.3)", () => {
  beforeEach(async () => {
    vi.mocked(mapStyleUrl).mockReset().mockReturnValue("https://example.test/style.json");
    const inst = await mapInstances();
    inst.maps.length = 0;
    inst.markers.length = 0;
  });

  it("read mode: shows the map + discreet coordinates, no 'Déplacer le repère'", () => {
    render(<ParkLocationEditor editing={false} latitude="44.099776" longitude="3.111459" />);
    expect(screen.getByLabelText("Carte de localisation du parc")).toBeTruthy();
    expect(screen.getByText("44.099776, 3.111459")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Déplacer le repère" })).toBeNull();
    expect(screen.queryByLabelText("Latitude")).toBeNull();
  });

  it("read mode with no recorded position: never shows invented coordinates", () => {
    render(<ParkLocationEditor editing={false} latitude="" longitude="" />);
    expect(screen.getByText("Position non renseignée")).toBeTruthy();
  });

  it("no map style → fallback: no map, numeric Latitude / Longitude fields usable", () => {
    vi.mocked(mapStyleUrl).mockReturnValue(null);
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.queryByLabelText("Carte de localisation du parc")).toBeNull();
    expect(screen.getByText(/Carte indisponible/)).toBeTruthy();
    const latField = screen.getByLabelText("Latitude") as HTMLInputElement;
    fireEvent.change(latField, { target: { value: "45.5" } });
    expect(onChange).toHaveBeenLastCalledWith("45.5", "3.070000");
  });

  it("'Déplacer le repère' toggles the move sub-mode", () => {
    render(<Harness />);
    const btn = screen.getByRole("button", { name: "Déplacer le repère" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    const on = screen.getByRole("button", { name: "Terminer le déplacement" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Cliquez sur la carte ou faites glisser le repère/)).toBeTruthy();
  });

  it("map click updates the draft ONLY when move mode is active — never writes", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const inst = await mapInstances();
    const map = inst.maps.at(-1)!;

    // move mode OFF → click ignored
    map.fire("click", { lngLat: { lat: 44.5, lng: 3.5 } });
    expect(onChange).not.toHaveBeenCalled();

    // activate, then click → draft updated
    fireEvent.click(screen.getByRole("button", { name: "Déplacer le repère" }));
    map.fire("click", { lngLat: { lat: 44.512345, lng: 3.523456 } });
    expect(onChange).toHaveBeenCalledWith("44.512345", "3.523456");
  });

  it("dragging the marker updates the draft (move mode), without saving", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Déplacer le repère" }));
    const inst = await mapInstances();
    const marker = inst.markers.at(-1)!;
    marker.lngLat = { lng: 3.2, lat: 44.2 };
    marker.fire("dragend");
    expect(onChange).toHaveBeenCalledWith("44.200000", "3.200000");
  });

  it("marker is not draggable until move mode is active", async () => {
    render(<Harness />);
    const inst = await mapInstances();
    const marker = inst.markers.at(-1)!;
    expect(marker.isDraggable()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Déplacer le repère" }));
    expect(marker.isDraggable()).toBe(true);
  });

  it("out-of-range typed coordinates are flagged and the marker is not placed there", async () => {
    render(<Harness lat0="44.1" lng0="3.07" />);
    const inst = await mapInstances();
    expect(inst.markers.length).toBe(1); // valid start → marker present

    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "999" } });
    expect(screen.getAllByText("Coordonnées invalides").length).toBeGreaterThan(0);
    // the existing marker is removed rather than moved to an invalid position
    expect(inst.markers.at(-1)!.getLngLat()).toEqual({ lng: 3.07, lat: 44.1 });
  });

  it("leaving edit mode closes the move sub-mode", () => {
    const { rerender } = render(<ParkLocationEditor editing latitude="44.1" longitude="3.07" />);
    fireEvent.click(screen.getByRole("button", { name: "Déplacer le repère" }));
    expect(screen.getByRole("button", { name: "Terminer le déplacement" })).toBeTruthy();
    rerender(<ParkLocationEditor editing={false} latitude="44.1" longitude="3.07" />);
    expect(screen.queryByRole("button", { name: /déplacer le repère/i })).toBeNull();
  });

  // ── directMove : contexte création (pas de bouton toggle) ────────────────
  describe("directMove (park creation)", () => {
    function Direct({ onChange }: { onChange?: (la: string, lo: string) => void }) {
      const [lat, setLat] = useState("");
      const [lng, setLng] = useState("");
      return (
        <ParkLocationEditor
          editing
          directMove
          latitude={lat}
          longitude={lng}
          onChange={(la, lo) => {
            setLat(la);
            setLng(lo);
            onChange?.(la, lo);
          }}
        />
      );
    }

    it("no 'Déplacer le repère' toggle — a persistent hint instead", () => {
      render(<Direct />);
      expect(screen.queryByRole("button", { name: /déplacer le repère/i })).toBeNull();
      expect(
        screen.getByText(/Cliquez sur la carte ou faites glisser le repère pour ajuster sa position/),
      ).toBeTruthy();
    });

    it("map click places the marker immediately (no toggle needed) — no write", async () => {
      const onChange = vi.fn();
      render(<Direct onChange={onChange} />);
      const inst = await mapInstances();
      inst.maps.at(-1)!.fire("click", { lngLat: { lat: 44.101234, lng: 3.105678 } });
      expect(onChange).toHaveBeenCalledWith("44.101234", "3.105678");
    });

    it("marker becomes draggable as soon as a valid position exists", async () => {
      render(
        <ParkLocationEditor editing directMove latitude="44.1" longitude="3.07" onChange={() => {}} />,
      );
      const inst = await mapInstances();
      expect(inst.markers.at(-1)!.isDraggable()).toBe(true);
    });

    it("flyToSignal recentres + zooms the map on the current position (3C.4b)", async () => {
      const { rerender } = render(
        <ParkLocationEditor editing directMove latitude="44.10" longitude="3.07" flyToSignal={0} />,
      );
      const inst = await mapInstances();
      const map = inst.maps.at(-1)! as unknown as {
        flyToCalls: { center: [number, number]; zoom?: number }[];
      };
      expect(map.flyToCalls.length).toBe(0); // token 0 → no fly
      rerender(
        <ParkLocationEditor editing directMove latitude="44.20" longitude="3.20" flyToSignal={1} />,
      );
      expect(map.flyToCalls.at(-1)).toEqual({ center: [3.2, 44.2], zoom: 15 });
    });
  });
});
