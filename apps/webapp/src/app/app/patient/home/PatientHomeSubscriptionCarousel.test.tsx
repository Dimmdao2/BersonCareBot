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

  it("uses horizontal snap scroll and card width band", () => {
    const { container } = render(
      <PatientHomeSubscriptionCarousel
        cards={[
          {
            itemId: "c1",
            title: "A",
            subtitle: null,
            imageUrl: null,
            badgeLabel: "Клуб",
            href: "/app/patient/content/a",
          },
          {
            itemId: "c2",
            title: "B",
            subtitle: null,
            imageUrl: null,
            badgeLabel: "Премиум",
            href: "/app/patient/content/b",
          },
        ]}
      />,
    );
    const track = container.querySelector(".snap-x.snap-mandatory");
    expect(track).toBeTruthy();
    const items = container.querySelectorAll('[data-testid="patient-home-subscription-carousel-item"]');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveClass("min-w-full");
    expect(items[0]).toHaveClass("w-full");
    expect(screen.getByText("Клуб")).toBeInTheDocument();
    expect(screen.getByText("Премиум")).toBeInTheDocument();
  });

  it("uses sectionTitle from block when provided", () => {
    render(
      <PatientHomeSubscriptionCarousel
        sectionTitle="Карусель из админки"
        cards={[
          {
            itemId: "c1",
            title: "One",
            subtitle: null,
            imageUrl: null,
            badgeLabel: "По подписке",
            href: "/app/patient/content/one",
          },
        ]}
      />,
    );
    expect(screen.getByText("Карусель из админки")).toHaveProperty("tagName", "P");
  });
});
