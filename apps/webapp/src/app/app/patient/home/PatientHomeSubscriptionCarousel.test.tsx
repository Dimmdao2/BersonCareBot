/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeSubscriptionCarousel } from "./PatientHomeSubscriptionCarousel";

describe("PatientHomeSubscriptionCarousel", () => {
  it("returns null when no cards", () => {
    const { container } = render(<PatientHomeSubscriptionCarousel cards={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders cards with badge", () => {
    render(
      <PatientHomeSubscriptionCarousel
        cards={[
          {
            itemId: "c1",
            title: "Carousel item",
            subtitle: "Sub",
            imageUrl: null,
            badgeLabel: "По подписке",
            href: "/app/patient/sections/x",
          },
        ]}
      />,
    );
    expect(screen.getByText("По подписке")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Carousel item/i })).toHaveAttribute("href", "/app/patient/sections/x");
  });
});
