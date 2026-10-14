import { describe, expect, it } from "vitest";
import { classifyAuthError } from "./authErrors";

describe("classifyAuthError", () => {
  it.each([
    [{ status: 429, code: "over_email_send_rate_limit" }, "rateLimit"],
    [{ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }, "network"],
    [{ code: "same_password", status: 422 }, "samePassword"],
    [{ code: "weak_password", status: 422 }, "weakPassword"],
    [{ name: "AuthSessionMissingError", message: "Auth session missing!" }, "sessionLost"],
    [{ status: 500, message: "boom" }, "generic"],
    [null, "generic"],
  ])("%j → %s", (err, expected) => {
    expect(classifyAuthError(err)).toBe(expected);
  });
});
