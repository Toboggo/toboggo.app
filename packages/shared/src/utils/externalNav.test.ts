/**
 * `hasValidCoordinates` / `getDirectionsUrl` — targeted tests, no framework:
 * Node's built-in test runner + TS stripping, same as this directory's other
 * `*.test.ts` files. Run: `npm run test -w @toboggo/shared`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { getDirectionsUrl, hasValidCoordinates } from "./externalNav.ts";

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

// ── getDirectionsUrl ─────────────────────────────────────────────────────

test("getDirectionsUrl: iPhone → Apple Maps HTTPS URL", () => {
  const url = getDirectionsUrl(48.8566, 2.3522, { userAgent: IPHONE_UA, maxTouchPoints: 5 });
  assert.equal(url, "https://maps.apple.com/?daddr=48.8566%2C2.3522");
});

test("getDirectionsUrl: iPadOS (Mac UA + multi-touch) → Apple Maps", () => {
  const url = getDirectionsUrl(48.8566, 2.3522, { userAgent: IPADOS_UA, maxTouchPoints: 5 });
  assert.match(url, /^https:\/\/maps\.apple\.com\/\?/);
});

test("getDirectionsUrl: a real Mac desktop (no touch points) → Google Maps, not Apple Maps", () => {
  const url = getDirectionsUrl(48.8566, 2.3522, { userAgent: DESKTOP_MAC_UA, maxTouchPoints: 0 });
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?/);
});

test("getDirectionsUrl: Android → Google Maps HTTPS URL", () => {
  const url = getDirectionsUrl(45.764, 4.8357, { userAgent: ANDROID_UA, maxTouchPoints: 5 });
  assert.equal(url, "https://www.google.com/maps/dir/?api=1&destination=45.764%2C4.8357");
});

test("getDirectionsUrl: Windows desktop → Google Maps HTTPS URL", () => {
  const url = getDirectionsUrl(45.764, 4.8357, { userAgent: DESKTOP_WINDOWS_UA, maxTouchPoints: 0 });
  assert.equal(url, "https://www.google.com/maps/dir/?api=1&destination=45.764%2C4.8357");
});

test("getDirectionsUrl: negative longitude is encoded correctly, not mangled", () => {
  const url = getDirectionsUrl(44.8378, -0.5792, { userAgent: ANDROID_UA, maxTouchPoints: 5 });
  assert.equal(url, "https://www.google.com/maps/dir/?api=1&destination=44.8378%2C-0.5792");
});

test("getDirectionsUrl: the coordinate separator is percent-encoded (no raw comma leaks into the query string)", () => {
  const appleUrl = getDirectionsUrl(48.8566, 2.3522, { userAgent: IPHONE_UA, maxTouchPoints: 5 });
  const googleUrl = getDirectionsUrl(48.8566, 2.3522, { userAgent: ANDROID_UA, maxTouchPoints: 5 });
  assert.equal(appleUrl.includes(","), false);
  assert.equal(googleUrl.includes(","), false);
  assert.equal(new URL(appleUrl).searchParams.get("daddr"), "48.8566,2.3522");
  assert.equal(new URL(googleUrl).searchParams.get("destination"), "48.8566,2.3522");
});
