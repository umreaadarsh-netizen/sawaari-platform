// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AppShell } from "./AppShell";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { _id: "u1", name: "Test Rider", email: "test@example.com", role: "rider" },
    isLoading: false,
    isAuthenticated: true,
    signIn: vi.fn(),
    signOut: mocks.signOut,
  }),
}));

const renderShell = (mode: "rider" | "driver" = "rider", onSwitchMode = vi.fn()) =>
  render(
    <MemoryRouter>
      <AppShell mode={mode} onSwitchMode={onSwitchMode} />
    </MemoryRouter>,
  );

describe("AppShell header — Electric Amber chrome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the mode pill, live badge and amber gradient hairline", () => {
    const { container } = renderShell("rider");

    expect(screen.getByText("rider mode")).toBeInTheDocument();
    expect(screen.getByText(/live · websocket/i)).toBeInTheDocument();
    expect(screen.getByText("Test Rider")).toBeInTheDocument();

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header?.querySelector('[class*="via-amber-400"]')).not.toBeNull();
  });

  it("switches dashboard mode on tab click", async () => {
    const user = userEvent.setup();
    const onSwitchMode = vi.fn();
    renderShell("rider", onSwitchMode);

    await user.click(screen.getByRole("button", { name: /driver/i }));
    expect(onSwitchMode).toHaveBeenCalledWith("driver");
  });

  it("signs out via the header action", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(mocks.signOut).toHaveBeenCalled();
  });
});
