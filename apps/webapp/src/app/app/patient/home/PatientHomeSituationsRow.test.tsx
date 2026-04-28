/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeSituationsRow } from "./PatientHomeSituationsRow";

describe("PatientHomeSituationsRow", () => {
  it("returns null for empty chips", () => {
    const { container } = render(<PatientHomeSituationsRow chips={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders links for chips", () => {
    render(
      <PatientHomeSituationsRow
        chips={[
          {
            itemId: "i1",
            slug: "alpha-section",
            title: "Alpha",
            imageUrl: null,
            href: "/app/patient/sections/alpha-section",
          },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /Alpha/i });
    expect(link).toHaveAttribute("href", "/app/patient/sections/alpha-section");
  });
});
