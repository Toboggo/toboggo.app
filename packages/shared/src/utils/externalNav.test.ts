/**
 * `hasValidCoordinates` / `getAvailableMapProviders` / `getDirectionsUrl` —
 * targeted tests, no framework: Node's built-in test runner + TS stripping,
 * same as this directory's other `*.test.ts` files.
 * Run: `npm run test -w @toboggo/shared`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { getAvailableMapProviders, getDirectionsUrl, hasValidCoordinates } from "./externalNav.ts";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
// iPadOS 13+ reports as a Mac; only `maxTouchPoints` tells it apart from one.
const IPADOS_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const DESKTOP_MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const DESKTOP_WINDOWS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// ── hasValidCoordinates ──────────────────────────────────────────────────

test("hasValidCoordinates: real French coordinates are valid", () => {
  assert.equal(hasValidCoordinates(48.8566, 2.3522), true); // Paris
  assert.equal(hasValidCoordinates(45.764, 4.8357), true); // Lyon
  assert.equal(hasValidCoordinates(44.8378, -0.5792), true); // Bordeaux — negative longitude
});

test("hasValidCoordinates: latitude out of [-90, 90] is invalid", () => {
  assert.equal(hasValidCoordinates(91, 2.3522), false);
  assert.equal(hasValidCoordinates(-91, 2.3522), false);
  assert.equal(hasValidCoordinates(90, 2.3522), true); // boundary itself is valid
  assert.equal(hasValidCoordinates(-90, 2.3522), true);
});

test("hasValidCoordinates: longitude out of [-180, 180] is invalid", () => {
  assert.equal(hasValidCoordinates(48.8566, 181), false);
  assert.equal(hasValidCoordinates(48.8566, -181), false);
  assert.equal(hasValidCoordinates(48.8566, 180), true); // boundary itself is valid
  assert.equal(hasValidCoordinates(48.8566, -180), true);
});

test("hasValidCoordinates: null/undefined coordinates are invalid", () => {
  assert.equal(hasValidCoordinates(null, 2.3522), false);
  assert.equal(hasValidCoordinates(48.8566, null), false);
  assert.equal(hasValidCoordinates(undefined, undefined), false);
  assert.equal(hasValidCoordinates(null, null), false);
});

test("hasValidCoordinates: NaN / non-finite coordinates are invalid", () => {
  assert.equal(hasValidCoordinates(NaN, 2.3522), false);
  assert.equal(hasValidCoordinates(48.8566, Infinity), false);
});

test("hasValidCoordinates: (0, 0) is treated as invalid — never a real Toboggo park", () => {
  assert.equal(hasValidCoordinates(0, 0), false);
});

test("hasValidCoordinates: a real park that merely has one zero coordinate stays valid", () => {
  assert.equal(hasValidCoordinates(0, 2.3522), true);
  assert.equal(hasValidCoordinates(48.8566, 0), true);
});

// ── getAvailableMapProviders ─────────────────────────────────────────────

test("getAvailableMapProviders: iPhone → Plans (Apple), Google Maps, Waze — in that order", () => {
  assert.deepEqual(getAvailableMapProviders({ userAgent: IPHONE_UA, maxTouchPoints: 5 }), ["apple", "google", "waze"]);
});

test("getAvailableMapProviders: iPadOS (Mac UA + multi-touch) → Plans included", () => {
  assert.deepEqual(getAvailableMapProviders({ userAgent: IPADOS_UA, maxTouchPoints: 5 }), ["apple", "google", "waze"]);
});

test("getAvailableMapProviders: Android → no Plans, only Google Maps + Waze", () => {
  assert.deepEqual(getAvailableMapProviders({ userAgent: ANDROID_UA, maxTouchPoints: 5 }), ["google", "waze"]);
});

test("getAvailableMapProviders: a real Mac desktop (no touch points) → no Plans, only Google Maps + Waze", () => {
  assert.deepEqual(getAvailableMapProviders({ userAgent: DESKTOP_MAC_UA, maxTouchPoints: 0 }), ["google", "waze"]);
});

test("getAvailableMapProviders: Windows desktop → Google Maps + Waze", () => {
  assert.deepEqual(getAvailableMapProviders({ userAgent: DESKTOP_WINDOWS_UA, maxTouchPoints: 0 }), ["google", "waze"]);
});

// ── getDirectionsUrl ─────────────────────────────────────────────────────

test("getDirectionsUrl: apple → Apple Maps HTTPS URL", () => {
  const url = getDirectionsUrl("apple", 48.8566, 2.3522);
  assert.equal(url, "https://maps.apple.com/?daddr=48.8566%2C2.3522");
});

test("getDirectionsUrl: google → Google Maps HTTPS URL", () => {
  const url = getDirectionsUrl("google", 45.764, 4.8357);
  assert.equal(url, "https://www.google.com/maps/dir/?api=1&destination=45.764%2C4.8357");
});

test("getDirectionsUrl: waze → Waze HTTPS URL", () => {
  const url = getDirectionsUrl("waze", 45.764, 4.8357);
  assert.equal(url, "https://waze.com/ul?ll=45.764%2C4.8357&navigate=yes");
});

test("getDirectionsUrl: negative longitude is encoded correctly, not mangled, for every provider", () => {
  assert.equal(getDirectionsUrl("apple", 44.8378, -0.5792), "https://maps.apple.com/?daddr=44.8378%2C-0.5792");
  assert.equal(
    getDirectionsUrl("google", 44.8378, -0.5792),
    "https://www.google.com/maps/dir/?api=1&destination=44.8378%2C-0.5792",
  );
  assert.equal(getDirectionsUrl("waze", 44.8378, -0.5792), "https://waze.com/ul?ll=44.8378%2C-0.5792&navigate=yes");
});

test("getDirectionsUrl: the coordinate separator is percent-encoded (no raw comma leaks into the query string)", () => {
  for (const provider of ["apple", "google", "waze"] as const) {
    const url = getDirectionsUrl(provider, 48.8566, 2.3522);
    assert.equal(url.includes(","), false);
    const parsed = new URL(url);
    const coordParam = provider === "apple" ? "daddr" : provider === "google" ? "destination" : "ll";
    assert.equal(parsed.searchParams.get(coordParam), "48.8566,2.3522");
  }
});
