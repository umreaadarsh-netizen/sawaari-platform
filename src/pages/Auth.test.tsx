// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import Auth from "./Auth";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    signIn: mocks.signIn,
    signOut: mocks.signOut,
  }),
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));

const renderAuth = () =>
  render(
    <MemoryRouter initialEntries={["/auth?returnTo=%2Fapp%2Frider"]}>
      <Auth />
    </MemoryRouter>,
  );

describe("Auth page — Electric Amber CTA smoke tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the gradient headline and primary phone CTA", () => {
    renderAuth();
    expect(
      screen.getByRole("heading", { name: /sign in to sawaari/i }),
    ).toBeInTheDocument();

    const sendOtp = screen.getByRole("button", { name: /send otp/i });
    expect(sendOtp).toHaveClass("bg-gradient-to-r", "from-amber-400", "to-orange-500");

    // Role cards + guest path are visible on the start screen.
    expect(
      screen.getByRole("button", { name: /book a rickshaw/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue as guest/i }),
    ).toBeInTheDocument();
  });

  it("enables Send OTP with a 10-digit phone, signs in, and shows the gradient Verify CTA", async () => {
    const user = userEvent.setup();
    renderAuth();

    const sendOtp = screen.getByRole("button", { name: /send otp/i });
    expect(sendOtp).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Mobile number"), "9876543210");
    expect(sendOtp).toBeEnabled();

    await user.click(sendOtp);
    expect(mocks.signIn).toHaveBeenCalledWith("phone-otp", expect.any(FormData));

    expect(
      await screen.findByRole("heading", { name: /enter your code/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/SMS with your code is on its way/i)).toBeInTheDocument();

    const verify = screen.getByRole("button", { name: /verify & continue/i });
    expect(verify).toHaveClass("bg-gradient-to-r", "from-amber-400", "to-orange-500");
  });

  it("renders the gradient email submit CTA on the email tab", async () => {
    const user = userEvent.setup();
    renderAuth();

    await user.click(screen.getByRole("button", { name: /email otp/i }));
    expect(
      screen.getByRole("heading", { name: /sign in with email/i }),
    ).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: "" });
    expect(submit).toHaveClass("bg-gradient-to-r", "from-amber-400", "to-orange-500");
  });

  it("guest login calls the anonymous provider", async () => {
    const user = userEvent.setup();
    renderAuth();

    await user.click(screen.getByRole("button", { name: /continue as guest/i }));
    expect(mocks.signIn).toHaveBeenCalledWith("anonymous");
  });
});
