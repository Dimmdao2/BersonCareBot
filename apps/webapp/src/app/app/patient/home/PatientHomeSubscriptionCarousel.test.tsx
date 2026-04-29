/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeSubscriptionCarousel } from "./PatientHomeSubscriptionCarousel";

describe("PatientHomeSubscriptionCarousel", () => {
  it("renders snap cards with href and badge", () => {
    render(
      <PatientHomeSubscriptionCarousel
        items={[
          {
            id: "a",
            title: "Новости",
            subtitle: "Обновления платформы",
            href: "/app/patient/notifications#a",
            badgeLabel: "Рассылка",
            imageUrl: null,
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /Новости/i })).toHaveAttribute("href", "/app/patient/notifications#a");
    expect(screen.getByText("Рассылка")).toBeInTheDocument();
  });

  it("returns null when empty", () => {
    const { container } = render(<PatientHomeSubscriptionCarousel items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("exposes only links for cards: badge is visual, no subscribe action", () => {
    render(
      <PatientHomeSubscriptionCarousel
        items={[
          {
            id: "x",
            title: "Тема X",
            subtitle: "Подзаголовок",
            href: "/app/patient/notifications#x",
            badgeLabel: "Тема",
            imageUrl: null,
          },
        ]}
      />,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    const link = screen.getByRole("link", { name: /Тема X/i });
    expect(link).toHaveAttribute("href", "/app/patient/notifications#x");
    expect(link.textContent).toContain("Тема");
  });
});
