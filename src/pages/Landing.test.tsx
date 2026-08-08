// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import Landing from "./Landing";

// The Leaflet map is irrelevant to these CTA assertions and pulls in DOM APIs
// jsdom lacks — stub it out.
vi.mock("@/components/map/SawaariMap", () => ({
  SawaariMap: () => <div data-testid="mock-map" />,
}));

const renderLanding = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );

describe("Landing page — Electric Amber CTA smoke tests", () => {
  it("renders the gradient primary CTAs in the nav and hero", () => {
    const { container } = renderLanding();
    // The hero headline is animated per-character with non-breaking spaces;
    // assert on the rendered h1 text rather than the computed a11y name.
    expect(container.querySelector("h1")).toHaveTextContent(
      /shaping\s+electric\s+transit/i,
    );

    const bookRide = screen.getByRole("link", { name: /book a ride/i });
    expect(bookRide).toHaveClass("bg-gradient-to-r", "from-amber-400", "to-orange-500");

    const bookNow = screen.getByRole("link", { name: /book now/i });
    expect(bookNow).toHaveClass("bg-gradient-to-r", "from-amber-400", "to-orange-500");

    expect(screen.getByRole("link", { name: /driver portal/i })).toBeInTheDocument();
  });

  it("renders all section eyebrows as glass chips", () => {
    renderLanding();
    const labels = [
      "Gotegaon routes",
      "Capabilities",
      "The fleet",
      "How it works",
      "For drivers",
      "FAQ",
    ];
    for (const label of labels) {
      expect(screen.getByText(label)).toHaveClass("glass-chip");
    }
  });

  it("filters routes and shows the gradient Book-this-route CTA", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.type(screen.getByPlaceholderText(/search routes/i), "market");
    expect(screen.getByText("Gotegaon Market")).toBeInTheDocument();

    // The gradient lives on the inner Button; the Link is just a wrapper.
    const bookRoute = screen.getByRole("button", { name: /book this route/i });
    expect(bookRoute).toHaveClass("bg-gradient-to-r", "from-amber-400", "to-orange-500");
  });

  it("expands the FAQ accordion on click", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(
      screen.getByRole("button", { name: /where does sawaari operate/i }),
    );
    expect(
      screen.getByText(/serves gotegaon and the surrounding villages/i),
    ).toBeInTheDocument();
  });
});
