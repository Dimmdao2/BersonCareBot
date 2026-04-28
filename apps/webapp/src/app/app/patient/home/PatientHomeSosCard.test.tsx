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
    expect(screen.getByRole("link", { name: /SOS title/i })).toHaveAttribute("href", "/app/patient/content/sos-page");
  });
});
