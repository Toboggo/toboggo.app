import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ParkVerification } from "@toboggo/shared";
import "../i18n/testInit";
import fr from "../i18n/locales/fr/contribute.json";
import en from "../i18n/locales/en/contribute.json";
import es from "../i18n/locales/es/contribute.json";
import { VerifyItem } from "./VerifyItem";

// Yes/no catalogue codes (supabase/migrations 0010, 0022, 0023): every one needs a natural phrasing.
const CODES = [
  "slide", "swing", "climbing", "sandbox", "springer", "zipline", "carousel", "motor_course", "multisport",
  "water_play", "play_structure", "seesaw", "playhouse", "trampoline", "balance_beam", "agility_trail",
  "horizontal_bar", "hopscotch", "toilets", "drinking_water", "parking", "benches", "picnic_tables", "lighting",
  "bike_parking", "wheelchair_access", "stroller_access", "accessible_toilets", "accessible_parking", "inclusive_play",
];

const item = (code: string, status: "available" | "unavailable") =>
  ({
    park: { id: "p", name: "Parc", city: null, cover_photo: null, distance_m: 100, features: {} },
    feature: { id: "f", code },
    status,
  }) as unknown as ParkVerification;
const noop = () => {};

describe("questions de vérification", () => {
  it.each([["fr", fr], ["en", en], ["es", es]] as const)("%s : présence et absence pour tous les codes", (_l, json) => {
    for (const code of CODES) {
      const v = json.hub.verify as unknown as Record<string, Record<string, string>>;
      expect(v.has[code], `has.${code}`).toBeTruthy();
      expect(v.lacks[code], `lacks.${code}`).toBeTruthy();
    }
  });

  it("bascule : présence et absence", () => {
    const { unmount } = render(<VerifyItem item={item("seesaw", "available")} busy={false} failed={false} onConfirm={noop} onEdit={noop} onSkip={noop} />);
    expect(screen.getByText("Y a-t-il une bascule dans ce parc ?")).toBeTruthy();
    unmount();
    render(<VerifyItem item={item("seesaw", "unavailable")} busy={false} failed={false} onConfirm={noop} onEdit={noop} onSkip={noop} />);
    expect(screen.getByText("Ce parc ne dispose pas de bascule. Est-ce exact ?")).toBeTruthy();
  });

  it("code inconnu : formulation générique", () => {
    render(<VerifyItem item={item("zzz_unknown", "available")} busy={false} failed={false} onConfirm={noop} onEdit={noop} onSkip={noop} />);
    expect(screen.getByText("Y a-t-il bien : zzz unknown ?")).toBeTruthy();
  });
});
