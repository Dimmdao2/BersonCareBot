/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ContentSectionRow } from "@/infra/repos/pgContentSections";
import { PatientHomeSituationsRow } from "./PatientHomeSituationsRow";

const mk = (slug: string, title: string, sort: number): ContentSectionRow => ({
  id: slug,
  slug,
  title,
  description: "",
  sortOrder: sort,
  isVisible: true,
  requiresAuth: false,
});

describe("PatientHomeSituationsRow", () => {
  it("renders horizontal links for sections", () => {
    const sections = [mk("a", "Первая ситуация", 1), mk("b", "Вторая", 2)];
    render(<PatientHomeSituationsRow sections={sections} />);
    expect(screen.getByRole("link", { name: /Первая ситуация/i })).toHaveAttribute("href", "/app/patient/sections/a");
    expect(screen.getByRole("link", { name: /Вторая/i })).toHaveAttribute("href", "/app/patient/sections/b");
  });

  it("returns null for empty list", () => {
    const { container } = render(<PatientHomeSituationsRow sections={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("uses same neutral tile styling for different slugs (no slug-based palette)", () => {
    const sections = [mk("alpha-slug", "Alpha", 1), mk("beta-slug", "Beta", 2)];
    const { container } = render(<PatientHomeSituationsRow sections={sections} />);
    const links = container.querySelectorAll("a[href^='/app/patient/sections/']");
    expect(links.length).toBe(2);
    expect(links[0]!.className).toBe(links[1]!.className);
  });
});
