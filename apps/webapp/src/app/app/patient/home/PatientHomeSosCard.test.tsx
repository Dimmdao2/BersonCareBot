/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeSosCard } from "./PatientHomeSosCard";

describe("PatientHomeSosCard", () => {
  it("returns null when sos is null", () => {
    const { container } = render(<PatientHomeSosCard sos={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders link when sos resolved", () => {
    render(
      <PatientHomeSosCard
        sos={{
          itemId: "1",
          title: "SOS title",
          subtitle: "Help",
          imageUrl: null,
          href: "/app/patient/content/sos-page",
        }}
      />,
    );
    expect(screen.getByText(/Если болит сейчас/i)).toBeInTheDocument();
    expect(screen.getByText("Рекомендации по облегчению боли")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Быстрая помощь/i })).toHaveAttribute("href", "/app/patient/content/sos-page");
  });

  it("renders custom leading block icon when blockIconImageUrl is set", () => {
    const { container } = render(
      <PatientHomeSosCard
        sos={{
          itemId: "1",
          title: "SOS title",
          subtitle: "Help",
          imageUrl: null,
          href: "/app/patient/content/sos-page",
        }}
        blockIconImageUrl="/api/media/dddddddd-dddd-4ddd-8ddd-dddddddddddd"
      />,
    );
    const imgs = container.querySelectorAll("img");
    const leading = [...imgs].find((el) => el.getAttribute("src")?.includes("dddddddd"));
    expect(leading).toBeTruthy();
  });
});
