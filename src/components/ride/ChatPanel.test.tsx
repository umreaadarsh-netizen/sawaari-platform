// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Id } from "@/convex/_generated/dataModel";
import { ChatPanel } from "./ChatPanel";

vi.mock("convex/react", () => ({
  useQuery: () => [],
  useMutation: () => vi.fn().mockResolvedValue(undefined),
}));

describe("ChatPanel — gradient send CTA", () => {
  it("renders the gradient send button and enables it with a draft", async () => {
    const user = userEvent.setup();
    render(<ChatPanel rideId={"rides_test" as Id<"rides">} selfUserId="u1" />);

    const send = screen.getByRole("button", { name: /send message/i });
    expect(send).toBeDisabled();
    expect(send).toHaveClass("bg-gradient-to-r", "from-amber-400", "to-orange-500");

    await user.type(screen.getByPlaceholderText("Message…"), "Hello driver");
    expect(send).toBeEnabled();
  });
});
