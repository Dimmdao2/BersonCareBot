/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RubitimeSection } from "./RubitimeSection";

describe("RubitimeSection (catalog v2)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, cities: [], branches: [], services: [], specialists: [], branchServices: [] }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders catalog v2 title and section headings", async () => {
    render(<RubitimeSection />);
    expect(await screen.findByText("Каталог записи (v2)")).toBeInTheDocument();
    expect(await screen.findByText("Города")).toBeInTheDocument();
    expect(screen.getByText("Филиалы")).toBeInTheDocument();
    expect(screen.getByText(/Услуги \(глобальный каталог\)/)).toBeInTheDocument();
    expect(screen.getByText("Специалисты")).toBeInTheDocument();
    expect(screen.getByText(/Связки филиал — услуга/)).toBeInTheDocument();
  });

  it("does not reference legacy booking profiles", () => {
    render(<RubitimeSection />);
    expect(screen.queryByText(/профил/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/bookingType/)).not.toBeInTheDocument();
    expect(screen.queryByText(/categoryCode/)).not.toBeInTheDocument();
  });
});
