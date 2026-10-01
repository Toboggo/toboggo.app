import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../../i18n/testInit";
import AuthForm from "./AuthForm";

const authMock = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  sendPasswordReset: vi.fn(),
}));
vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, ...authMock, signInWithGoogle: vi.fn() };
});

const trackEventMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/analytics", () => ({ trackEvent: trackEventMock }));

const googleMock = vi.hoisted(() => ({ clear: vi.fn(), start: vi.fn() }));
vi.mock("../../lib/googleLogin", () => ({
  clearGoogleLoginMarker: googleMock.clear,
  startGoogleLogin: googleMock.start,
}));

vi.mock("../../lib/toast", () => ({
  useToastStore: (sel: (s: unknown) => unknown) => sel({ show: vi.fn() }),
}));

function submit(mode: "login" | "signup") {
  const { container } = render(
    <MemoryRouter initialEntries={[`/login?mode=${mode}`]}>
      <AuthForm />
    </MemoryRouter>,
  );
  fireEvent.change(container.querySelector("#auth-email")!, { target: { value: "alice@parents.fr" } });
  fireEvent.change(container.querySelector("#auth-pwd")!, { target: { value: "secret123" } });
  fireEvent.submit(container.querySelector("form")!);
}

beforeEach(() => {
  trackEventMock.mockReset();
  googleMock.clear.mockReset();
  authMock.signIn.mockReset().mockResolvedValue({});
  authMock.signUp.mockReset().mockResolvedValue({ session: null });
  localStorage.clear();
});

describe("AuthForm analytics", () => {
  it("email login → login_completed {provider:'email'} exactly once", async () => {
    submit("login");
    await waitFor(() => expect(trackEventMock).toHaveBeenCalledWith("login_completed", { provider: "email" }));
    expect(trackEventMock.mock.calls.filter(([n]) => n === "login_completed")).toHaveLength(1);
    expect(trackEventMock.mock.calls.some(([n]) => n === "signup_completed")).toBe(false);
    expect(googleMock.clear).toHaveBeenCalled();
  });

  it("failed email login → no login_completed", async () => {
    authMock.signIn.mockRejectedValue(new Error("Invalid login credentials"));
    submit("login");
    await waitFor(() => expect(authMock.signIn).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(trackEventMock).not.toHaveBeenCalledWith("login_completed", expect.anything());
  });

  it("signup → signup_completed (unchanged), no login_completed", async () => {
    submit("signup");
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith("signup_completed", { provider: "email", entry_point: "splash" }),
    );
    expect(trackEventMock.mock.calls.some(([n]) => n === "login_completed")).toBe(false);
  });
});
