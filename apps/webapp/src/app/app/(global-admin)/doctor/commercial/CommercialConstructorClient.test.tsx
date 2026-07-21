/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommercialConstructorClient } from "./CommercialConstructorClient";

afterEach(() => vi.unstubAllGlobals());

describe("CommercialConstructorClient", () => {
  it("renders the platform tariff constructor from the dedicated aggregate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, tariffs: [], organizations: [], trialPolicy: null }),
    })));

    render(<CommercialConstructorClient />);

    expect(screen.getByRole("tab", { name: "Тарифы" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Организации" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Триал" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Созданные тарифы" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Новый тариф" })).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/commercial", { cache: "no-store" }));
  });

  it("shows the persisted commercial lifecycle state instead of implying that every org has a trial", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        tariffs: [],
        organizations: [{
          id: "11111111-1111-4111-8111-111111111111",
          title: "Клиника без триала",
          tariffId: null,
          isActive: true,
          commercialAccessState: "no_trial",
        }],
        trialPolicy: null,
      }),
    })));

    render(<CommercialConstructorClient />);
    fireEvent.click(screen.getByRole("tab", { name: "Организации" }));
    fireEvent.click((await screen.findAllByRole("combobox"))[0]!);
    fireEvent.click(screen.getByText("Клиника без триала"));

    expect(await screen.findByText("Состояние: Триал не назначен")).toBeInTheDocument();
  });
});
