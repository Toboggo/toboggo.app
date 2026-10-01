import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { searchParks, searchPlaces, type GeoPlace, type Park } from "@toboggo/shared";
import "../../i18n/testInit";
import { SearchOverlay, shouldListPlacesFirst } from "./SearchOverlay";
import fr from "../../i18n/locales/fr/map.json";
import en from "../../i18n/locales/en/map.json";
import es from "../../i18n/locales/es/map.json";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, searchParks: vi.fn(), searchPlaces: vi.fn() };
});

const BARCELONA: GeoPlace = {
  id: "es",
  name: "Barcelone",
  label: "Barcelone, Espagne",
  context: "Catalogne, Espagne",
  lat: 41.38,
  lng: 2.17,
  bbox: [2.05, 41.32, 2.23, 41.47],
  placeType: ["municipality"],
};
const VENEZUELA: GeoPlace = { ...BARCELONA, id: "ve", label: "Barcelone, Venezuela", context: undefined, lat: 10.13, lng: -64.7 };
const MADRID: GeoPlace = { id: "mad", name: "Madrid", label: "Madrid, Espagne", lat: 40.41, lng: -3.7 };
const PARK = {
  id: "park-1",
  name: "Aire de jeux",
  city: "Roanne",
  formatted_address: "Avenue de Barcelone",
  latitude: 46.03,
  longitude: 4.07,
  lat: 46.03,
  lng: 4.07,
  translated_names: [],
} as unknown as Park;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let client: QueryClient;
const onClose = vi.fn();
const onSelectPark = vi.fn();
const onSelectPlace = vi.fn();

function setup() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <SearchOverlay onClose={onClose} onSelectPark={onSelectPark} onSelectPlace={onSelectPlace} />
    </QueryClientProvider>,
  );
  const input = screen.getByPlaceholderText(fr.searchPlaceholder) as HTMLInputElement;
  return Object.assign(input, { unmountOverlay: unmount });
}
const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });
const enter = (input: HTMLInputElement) => fireEvent.submit(input.closest("form") as HTMLFormElement);
const placeCalls = () => vi.mocked(searchPlaces).mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(searchParks).mockResolvedValue([]);
  vi.mocked(searchPlaces).mockResolvedValue([]);
});

describe("SearchOverlay — Entrée = recherche géographique", () => {
  it("Enter resolves the PLACE even when PARK results are listed — no park is selected", async () => {
    vi.mocked(searchParks).mockResolvedValue([PARK]);
    vi.mocked(searchPlaces).mockResolvedValue([BARCELONA, VENEZUELA]);
    const input = setup();
    type(input, "Barcelone");
    await screen.findByText("Avenue de Barcelone"); // park row is on screen
    await screen.findByText("Catalogne, Espagne"); // place row with provider context

    enter(input);

    await waitFor(() => expect(onSelectPlace).toHaveBeenCalledTimes(1));
    expect(onSelectPlace.mock.calls[0][0]).toMatchObject({ name: "Barcelone", lat: 41.38, bbox: BARCELONA.bbox });
    expect(onSelectPark).not.toHaveBeenCalled();
  });

  it("clicking the place row goes through the same handler (same payload as Enter)", async () => {
    vi.mocked(searchPlaces).mockResolvedValue([BARCELONA]);
    const input = setup();
    type(input, "Barcelone");
    fireEvent.click(await screen.findByText("Catalogne, Espagne"));
    const clickPayload = onSelectPlace.mock.calls[0][0];

    onSelectPlace.mockClear();
    input.unmountOverlay();
    const input2 = setup();
    type(input2, "Barcelone");
    await screen.findAllByText("Catalogne, Espagne");
    enter(input2);
    await waitFor(() => expect(onSelectPlace).toHaveBeenCalledTimes(1));
    expect(onSelectPlace.mock.calls[0][0]).toEqual(clickPayload);
  });

  it("clicking a PARK row selects the park with its coordinates (not a place)", async () => {
    vi.mocked(searchParks).mockResolvedValue([PARK]);
    const input = setup();
    type(input, "Barcelone");
    fireEvent.click(await screen.findByText("Avenue de Barcelone"));
    expect(onSelectPark).toHaveBeenCalledWith({ id: "park-1", lat: 46.03, lng: 4.07, city: "Roanne", name: "Aire de jeux" });
    expect(onSelectPlace).not.toHaveBeenCalled();
  });

  it("Enter while autocomplete is still loading waits for the geocoding result", async () => {
    const d = deferred<GeoPlace[]>();
    vi.mocked(searchPlaces).mockReturnValue(d.promise);
    const input = setup();
    type(input, "Barcelone");
    enter(input); // before the 300 ms debounce even fired
    await waitFor(() => expect(placeCalls()).toBe(1));
    expect(onSelectPlace).not.toHaveBeenCalled();

    await act(async () => d.resolve([BARCELONA]));
    await waitFor(() => expect(onSelectPlace).toHaveBeenCalledTimes(1));
    expect(onSelectPlace.mock.calls[0][0]).toMatchObject({ name: "Barcelone" });
    expect(onSelectPark).not.toHaveBeenCalled();
  });

  it("shows « Aucun lieu trouvé » and selects nothing when no place matches", async () => {
    vi.mocked(searchPlaces).mockResolvedValue([]);
    const input = setup();
    type(input, "Zzzzz");
    enter(input);
    expect(await screen.findByText("Aucun lieu trouvé pour « Zzzzz »")).toBeTruthy();
    expect(onSelectPlace).not.toHaveBeenCalled();
    expect(onSelectPark).not.toHaveBeenCalled();
  });

  it("shows a clean error message when geocoding fails, and selects nothing", async () => {
    vi.mocked(searchPlaces).mockRejectedValue(new Error("MapTiler 500"));
    const input = setup();
    type(input, "Barcelone");
    enter(input);
    expect(await screen.findByText(fr.search.error)).toBeTruthy();
    expect(onSelectPlace).not.toHaveBeenCalled();
    expect(screen.queryByText(/Aucun lieu trouvé/)).toBeNull();
  });

  it("does not claim « no place found » while results are still loading", async () => {
    const d = deferred<GeoPlace[]>();
    vi.mocked(searchPlaces).mockReturnValue(d.promise);
    const input = setup();
    type(input, "Barcelone");
    expect(screen.getByText(fr.search.searching)).toBeTruthy();
    expect(screen.queryByText(/Aucun lieu trouvé/)).toBeNull();
    await act(async () => d.resolve([]));
    expect(await screen.findByText("Aucun lieu trouvé pour « Barcelone »")).toBeTruthy();
  });

  it("repeated Enter triggers a single movement", async () => {
    const d = deferred<GeoPlace[]>();
    vi.mocked(searchPlaces).mockReturnValue(d.promise);
    const input = setup();
    type(input, "Barcelone");
    enter(input);
    enter(input);
    enter(input);
    await act(async () => d.resolve([BARCELONA]));
    await waitFor(() => expect(onSelectPlace).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(onSelectPlace).toHaveBeenCalledTimes(1);
    expect(placeCalls()).toBe(1); // one resolution, not one per Enter
  });

  it("a slow search A can never override the more recent search B", async () => {
    const a = deferred<GeoPlace[]>();
    vi.mocked(searchPlaces).mockImplementation(async (q) => (q === "Barce" ? a.promise : [BARCELONA]));
    const input = setup();
    type(input, "Barce");
    enter(input); // A in flight
    type(input, "Barcelone");
    enter(input); // B
    await waitFor(() => expect(onSelectPlace).toHaveBeenCalledTimes(1));

    await act(async () => a.resolve([MADRID])); // A comes back late
    expect(onSelectPlace).toHaveBeenCalledTimes(1);
    expect(onSelectPlace.mock.calls[0][0]).toMatchObject({ name: "Barcelone" });
  });

  it("clicking a place while an Enter resolution is pending ignores the older request", async () => {
    vi.mocked(searchPlaces).mockResolvedValue([MADRID]);
    const input = setup();
    type(input, "Madrid");
    const row = await screen.findByText("Madrid, Espagne");

    const pending = deferred<GeoPlace[]>();
    vi.mocked(searchPlaces).mockReturnValue(pending.promise);
    void client.invalidateQueries({ queryKey: ["search-places"] }); // forces Enter to miss the fresh cache
    enter(input);
    fireEvent.click(row);
    expect(onSelectPlace).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve([BARCELONA]));
    await new Promise((r) => setTimeout(r, 20));
    expect(onSelectPlace).toHaveBeenCalledTimes(1);
    expect(onSelectPlace.mock.calls[0][0]).toMatchObject({ name: "Madrid" });
  });
});

describe("SearchOverlay — no emoji, i18n", () => {
  it("renders no system emoji in the suggestions", () => {
    setup();
    expect(document.body.textContent ?? "").not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("has the new search strings in FR, EN and ES", () => {
    for (const c of [fr, en, es]) {
      for (const k of ["noPlace", "error", "searching"] as const) expect(c.search[k]).toBeTruthy();
      expect(c.nearby.titlePlace).toContain("{{place}}");
    }
    expect(Object.keys(en.search).sort()).toEqual(Object.keys(fr.search).sort());
    expect(Object.keys(es.search).sort()).toEqual(Object.keys(fr.search).sort());
  });
});

// ── Ordre LIEUX / PARCS ────────────────────────────────────────────────────
const TOULOUSE: GeoPlace = { id: "tls", name: "Toulouse", label: "Toulouse, France", context: "Occitanie, France", lat: 43.6, lng: 1.44 };
const MILLAU: GeoPlace = { id: "mil", name: "Millau", label: "Millau, France", context: "Occitanie, France", lat: 44.1, lng: 3.08 };
const park = (id: string, name: string, address: string) =>
  ({ ...PARK, id, name, formatted_address: address }) as unknown as Park;
const PARKS_IN_CITY = [
  park("p-a", "Aire de jeux", "Allée Charles Denat, 31000 Toulouse"),
  park("p-b", "Aire de jeu du télégraphe", "Rue Claude Chappe, 31000 Toulouse"),
];

const sectionOrder = () =>
  [...document.querySelectorAll('[class*="sectionTitle"]')].map((el) => el.textContent);
// CSS uppercases the titles visually only; the DOM text is the i18n string.
const norm = (xs: (string | null)[]) => xs.map((x) => (x ?? "").toLowerCase());
const PLACES_FIRST = norm([fr.search.places, fr.search.parks]);

describe("SearchOverlay — ordre des sections", () => {
  it("exact place name → LIEUX before PARCS (case, accents and spaces ignored)", async () => {
    vi.mocked(searchParks).mockResolvedValue(PARKS_IN_CITY);
    vi.mocked(searchPlaces).mockResolvedValue([TOULOUSE]);
    for (const value of ["Toulouse", "toulouse", "TOULOUSE", "Toulouse "]) {
      const input = setup();
      type(input, value);
      await screen.findByText("Allée Charles Denat, 31000 Toulouse");
      await screen.findByText("Occitanie, France");
      await waitFor(() => expect(norm(sectionOrder())).toEqual(PLACES_FIRST));
      input.unmountOverlay();
      document.body.innerHTML = "";
    }
  });

  it("Barcelone and Millau: the exact place comes first", async () => {
    vi.mocked(searchParks).mockResolvedValue([park("p-c", "Aire de jeux", "Avenue de Barcelone")]);
    vi.mocked(searchPlaces).mockResolvedValue([BARCELONA, VENEZUELA]);
    let input = setup();
    type(input, "Barcelone");
    await screen.findByText("Catalogne, Espagne");
    await waitFor(() => expect(norm(sectionOrder())).toEqual(PLACES_FIRST));
    expect(screen.getAllByRole("button").find((b) => b.textContent?.startsWith("Barcelone"))?.textContent).toContain("Catalogne, Espagne");
    input.unmountOverlay();

    vi.mocked(searchPlaces).mockResolvedValue([MILLAU]);
    input = setup();
    type(input, "Millau");
    await screen.findByText("Occitanie, France");
    await waitFor(() => expect(norm(sectionOrder())).toEqual(PLACES_FIRST));
  });

  it("park-oriented query (no exact place name) keeps PARCS first", async () => {
    vi.mocked(searchParks).mockResolvedValue([park("p-d", "Parc de la Ramée", "Chemin de la Ramée, Toulouse")]);
    vi.mocked(searchPlaces).mockResolvedValue([{ ...TOULOUSE, id: "x", name: "Ramée", label: "Ramée, France", context: undefined }]);
    const input = setup();
    type(input, "Parc de la Ramée");
    await screen.findByText("Chemin de la Ramée, Toulouse");
    await screen.findByText("Ramée, France");
    expect(norm(sectionOrder())).toEqual(norm([fr.search.parks, fr.search.places]));
  });

  it("a park with the exact queried name keeps PARCS first, even if the place also matches exactly", async () => {
    vi.mocked(searchParks).mockResolvedValue([park("p-e", "Barcelone", "1 rue X")]);
    vi.mocked(searchPlaces).mockResolvedValue([BARCELONA]);
    const input = setup();
    type(input, "Barcelone");
    await screen.findByText("1 rue X");
    await screen.findByText("Catalogne, Espagne");
    expect(norm(sectionOrder())).toEqual(norm([fr.search.parks, fr.search.places]));
  });

  it("prefix / inclusion place match keeps today's order (PARCS first)", async () => {
    vi.mocked(searchParks).mockResolvedValue(PARKS_IN_CITY);
    vi.mocked(searchPlaces).mockResolvedValue([{ ...TOULOUSE, id: "l", name: "Toulouse-Lautrec", label: "Toulouse-Lautrec, France", context: undefined }]);
    const input = setup();
    type(input, "Toulouse");
    await screen.findByText("Toulouse-Lautrec, France");
    await screen.findByText("Allée Charles Denat, 31000 Toulouse");
    expect(norm(sectionOrder())).toEqual(norm([fr.search.parks, fr.search.places]));
  });

  it("no relevant place → only PARCS, as before", async () => {
    vi.mocked(searchParks).mockResolvedValue(PARKS_IN_CITY);
    vi.mocked(searchPlaces).mockResolvedValue([]);
    const input = setup();
    type(input, "Toulouse");
    await screen.findByText("Allée Charles Denat, 31000 Toulouse");
    await waitFor(() => expect(placeCalls()).toBeGreaterThan(0));
    expect(norm(sectionOrder())).toEqual(norm([fr.search.parks]));
  });

  it("homonyms: the existing geographic ranking decides which place is listed first", async () => {
    vi.mocked(searchParks).mockResolvedValue(PARKS_IN_CITY);
    vi.mocked(searchPlaces).mockResolvedValue([VENEZUELA, BARCELONA]); // provider order kept between equal matches
    const input = setup();
    type(input, "Barcelone");
    await waitFor(() => expect(norm(sectionOrder())).toEqual(PLACES_FIRST));
    enter(input);
    await waitFor(() => expect(onSelectPlace).toHaveBeenCalledTimes(1));
    expect(onSelectPlace.mock.calls[0][0]).toMatchObject({ lat: VENEZUELA.lat }); // same place as the first listed
  });

  it("Enter stays geographic, and park / place clicks are unchanged, whatever the order", async () => {
    vi.mocked(searchParks).mockResolvedValue(PARKS_IN_CITY);
    vi.mocked(searchPlaces).mockResolvedValue([TOULOUSE]);
    const input = setup();
    type(input, "Toulouse");
    await waitFor(() => expect(norm(sectionOrder())).toEqual(PLACES_FIRST));

    enter(input);
    await waitFor(() => expect(onSelectPlace).toHaveBeenCalledTimes(1));
    expect(onSelectPark).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Allée Charles Denat, 31000 Toulouse"));
    expect(onSelectPark).toHaveBeenCalledWith(expect.objectContaining({ id: "p-a" }));
    fireEvent.click(screen.getByText("Occitanie, France"));
    expect(onSelectPlace).toHaveBeenCalledTimes(2);
  });
});

describe("shouldListPlacesFirst", () => {
  it("is generic: exact first place and no exact-named park", () => {
    expect(shouldListPlacesFirst("Madrid", [{ name: "Madrid" }], ["Parc A"])).toBe(true);
    expect(shouldListPlacesFirst("madrid", [{ name: "Madrid" }], [])).toBe(true);
    expect(shouldListPlacesFirst("Madrid", [{ name: "Madrid" }], ["madrid"])).toBe(false);
    expect(shouldListPlacesFirst("Madrid", [{ name: "Madridejos" }, { name: "Madrid" }], [])).toBe(false); // only the best place counts
    expect(shouldListPlacesFirst("Madrid", [], [])).toBe(false);
    expect(shouldListPlacesFirst("Madrid", undefined, [])).toBe(false);
  });
});
