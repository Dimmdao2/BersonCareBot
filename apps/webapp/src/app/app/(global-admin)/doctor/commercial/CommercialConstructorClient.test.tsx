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

    expect(await screen.findByRole("tab", { name: "Тарифы" })).toBeInTheDocument();
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
          effectiveAccess: { lifecycle: "read_only", tariffId: null, source: "no_trial" },
          overrides: [{
            id: "22222222-2222-4222-8222-222222222222",
            organizationId: "11111111-1111-4111-8111-111111111111",
            mechanic: "courses",
            enabled: false,
            quota: null,
            expiresAt: "2026-08-01T00:00:00.000Z",
            seatLimitOverride: null,
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
          }],
          trial: null,
        }],
        trialPolicy: null,
      }),
    })));

    render(<CommercialConstructorClient />);
    fireEvent.click(await screen.findByRole("tab", { name: "Организации" }));
    fireEvent.click((await screen.findAllByRole("combobox"))[0]!);
    fireEvent.click(screen.getByText("Клиника без триала"));

    expect(await screen.findByText("Доступ: Только чтение")).toBeInTheDocument();
    expect(screen.getByText(/Курсы: запрещено; действует до/)).toBeInTheDocument();
    expect(screen.getByText("Триал не запускался.")).toBeInTheDocument();
  });

  it("shows loading and a load error explicitly", async () => {
    let rejectRequest: ((reason: Error) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((_resolve, reject) => { rejectRequest = reject; })));
    render(<CommercialConstructorClient />);
    expect(screen.getByRole("status")).toHaveTextContent("Загрузка коммерческих настроек");
    rejectRequest?.(new Error("network_failed"));
    expect(await screen.findByRole("alert")).toHaveTextContent("network_failed");
  });
});
