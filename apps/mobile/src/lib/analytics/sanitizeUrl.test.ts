import { describe, expect, it } from "vitest";
import type { CaptureResult } from "posthog-js";
import { sanitizeCaptureResult, sanitizeUrl } from "./sanitizeUrl";

const SECRETS = [
  "access_token",
  "refresh_token",
  "provider_token",
  "token_type",
  "expires_at",
  "expires_in",
  "code=",
  "AAA",
  "BBB",
  "SECRET",
];

function expectNoSecret(value: unknown) {
  const text = JSON.stringify(value);
  for (const s of SECRETS) expect(text).not.toContain(s);
}

describe("sanitizeUrl", () => {
  it("strips the Supabase OAuth hash", () => {
    expect(sanitizeUrl("https://toboggo-app.vercel.app/#access_token=AAA&refresh_token=BBB")).toBe(
      "https://toboggo-app.vercel.app/",
    );
  });

  it("strips the full implicit-flow hash (provider_token, token_type, expires_*)", () => {
    const out = sanitizeUrl(
      "https://toboggo-app.vercel.app/map#access_token=SECRET&provider_token=SECRET&token_type=bearer&expires_at=1&expires_in=3600&refresh_token=SECRET",
    );
    expect(out).toBe("https://toboggo-app.vercel.app/map");
    expectNoSecret(out);
  });

  it("strips a PKCE ?code= query", () => {
    const out = sanitizeUrl("https://toboggo-app.vercel.app/?code=SECRET&foo=1");
    expect(out).toBe("https://toboggo-app.vercel.app/");
    expectNoSecret(out);
  });

  it("keeps origin + pathname for a normal URL", () => {
    expect(sanitizeUrl("https://toboggo-app.vercel.app/park/abc")).toBe("https://toboggo-app.vercel.app/park/abc");
  });

  it("handles relative URLs", () => {
    expect(sanitizeUrl("/map?code=SECRET#access_token=SECRET")).toBe("/map");
  });

  it("handles non-http schemes and invalid strings without throwing", () => {
    expect(sanitizeUrl("android-app://com.google.android.gm?code=SECRET#access_token=SECRET")).toBe(
      "android-app://com.google.android.gm",
    );
    expect(sanitizeUrl("not a url #access_token=SECRET")).toBe("not a url ");
    expect(sanitizeUrl("")).toBe("");
  });

  it("never throws and never passes through unexpected values", () => {
    for (const v of [undefined, null, 42, {}, [], () => "x"]) expect(sanitizeUrl(v)).toBeUndefined();
  });
});

describe("sanitizeCaptureResult (before_send)", () => {
  const dirty = "https://toboggo-app.vercel.app/#access_token=AAA&refresh_token=BBB&expires_at=1&expires_in=2";
  const make = (): CaptureResult =>
    ({
      uuid: "u",
      event: "app_opened",
      properties: {
        $current_url: dirty,
        $referrer: "https://accounts.google.com/o/oauth2?code=SECRET&provider_token=SECRET",
        $initial_current_url: dirty,
        $initial_referrer: "https://x.test/?code=SECRET#token_type=bearer",
        $session_entry_url: dirty,
        $host: "toboggo-app.vercel.app",
        environment: "production",
      },
      $set: { $current_url: dirty },
      $set_once: { $initial_current_url: dirty, $initial_referrer: "https://x.test/#access_token=SECRET" },
    }) as unknown as CaptureResult;

  it("sanitises $current_url, $referrer, $initial_current_url, $initial_referrer (and $set/$set_once)", () => {
    const out = sanitizeCaptureResult(make())!;
    expect(out.properties.$current_url).toBe("https://toboggo-app.vercel.app/");
    expect(out.properties.$referrer).toBe("https://accounts.google.com/o/oauth2");
    expect(out.properties.$initial_current_url).toBe("https://toboggo-app.vercel.app/");
    expect(out.properties.$initial_referrer).toBe("https://x.test/");
    expect(out.properties.$session_entry_url).toBe("https://toboggo-app.vercel.app/");
    expectNoSecret(out);
  });

  it("leaves non-URL properties untouched and never drops the event", () => {
    const out = sanitizeCaptureResult(make())!;
    expect(out.event).toBe("app_opened");
    expect(out.properties.$host).toBe("toboggo-app.vercel.app");
    expect(out.properties.environment).toBe("production");
  });

  it("tolerates null / missing properties", () => {
    expect(sanitizeCaptureResult(null)).toBeNull();
    expect(() => sanitizeCaptureResult({ uuid: "u", event: "x" } as unknown as CaptureResult)).not.toThrow();
  });
});
