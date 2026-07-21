/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
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
});
