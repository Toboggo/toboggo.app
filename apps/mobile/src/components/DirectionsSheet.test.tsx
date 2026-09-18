import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { MapProvider } from "@toboggo/shared";
import "../i18n/testInit";
import { DirectionsSheet } from "./DirectionsSheet";

function stubUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: userAgent });
}

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("DirectionsSheet", () => {
  const originalUserAgent = window.navigator.userAgent;

  afterEach(() => {
    stubUserAgent(originalUserAgent);
  });

  it("on Android: offers Google Maps + Waze, never Plans (Apple Maps)", () => {
    stubUserAgent(ANDROID_UA);
    render(<DirectionsSheet open onClose={() => {}} onChoose={() => {}} />);

    expect(screen.getByText("Google Maps")).toBeTruthy();
    expect(screen.getByText("Waze")).toBeTruthy();
    expect(screen.queryByText("Plans")).toBeNull();
  });

  it("on iPhone: offers Plans, Google Maps and Waze", () => {
    stubUserAgent(IPHONE_UA);
    render(<DirectionsSheet open onClose={() => {}} onChoose={() => {}} />);

    expect(screen.getByText("Plans")).toBeTruthy();
    expect(screen.getByText("Google Maps")).toBeTruthy();
    expect(screen.getByText("Waze")).toBeTruthy();
  });

  it("choosing an app calls onChoose with that provider, not onClose", () => {
    stubUserAgent(IPHONE_UA);
    const onChoose = vi.fn();
    const onClose = vi.fn();
    render(<DirectionsSheet open onClose={onClose} onChoose={onChoose} />);

    fireEvent.click(screen.getByText("Waze"));

    expect(onChoose).toHaveBeenCalledWith<[MapProvider]>("waze");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Annuler calls onClose, never onChoose", () => {
    stubUserAgent(IPHONE_UA);
    const onChoose = vi.fn();
    const onClose = vi.fn();
    render(<DirectionsSheet open onClose={onClose} onChoose={onChoose} />);

    fireEvent.click(screen.getByText("Annuler"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("closed: renders nothing", () => {
    stubUserAgent(IPHONE_UA);
    render(<DirectionsSheet open={false} onClose={() => {}} onChoose={() => {}} />);

    expect(screen.queryByText("Waze")).toBeNull();
  });
});
