/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RubitimeSection } from "./RubitimeSection";

const sampleService = {
  id: "550e8400-e29b-41d4-a716-446655440010",
  title: "Приём",
  description: null,
  durationMinutes: 60,
  priceMinor: 400000,
  isActive: true,
  sortOrder: 0,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("RubitimeSection (catalog v2)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          cities: [],
          branches: [],
          services: [],
          specialists: [],
          branchServices: [],
        }),
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

  it("renders service editor and PATCHes by service id without rubitime fields", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/services/") && init?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, service: { ...sampleService, durationMinutes: 90 } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ok: true,
          cities: [],
          branches: [],
          services: [sampleService],
          specialists: [],
          branchServices: [],
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RubitimeSection />);
    expect(await screen.findByDisplayValue("Приём")).toBeInTheDocument();

    const durationInputs = screen.getAllByPlaceholderText("Длительность (мин)");
    await userEvent.clear(durationInputs[0]!);
    await userEvent.type(durationInputs[0]!, "90");

    const saveButtons = screen.getAllByRole("button", { name: "Сохранить" });
    await userEvent.click(saveButtons[0]!);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/booking-catalog/services/${sampleService.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          title: "Приём",
          description: null,
          durationMinutes: 90,
          priceMinor: 400000,
        }),
      }),
    );
  });
});
