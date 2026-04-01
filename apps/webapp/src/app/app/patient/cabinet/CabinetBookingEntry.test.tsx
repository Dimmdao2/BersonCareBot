/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CabinetBookingEntry } from "./CabinetBookingEntry";

const BS_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("./useMobileViewport", () => ({
  useMobileViewport: () => false,
}));

describe("CabinetBookingEntry (in-person v2)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/api/booking/catalog/cities")) {
          return {
            ok: true,
            json: async () => ({ ok: true, cities: [{ id: "c1", code: "moscow", title: "Москва" }] }),
          };
        }
        if (url.includes("/api/booking/catalog/services")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              services: [{ id: BS_ID, service: { title: "Сеанс", durationMinutes: 60 } }],
            }),
          };
        }
        if (url.includes("/api/booking/slots")) {
          return { ok: true, json: async () => ({ ok: true, slots: [] }) };
        }
        return { ok: false, json: async () => ({ ok: false }) };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function slotFetchCalls(fetchSpy: ReturnType<typeof vi.fn>): string[] {
    return fetchSpy.mock.calls
      .map((c) => String(typeof c[0] === "string" ? c[0] : (c[0] as Request).url))
      .filter((u) => u.includes("/api/booking/slots"));
  }

  it("loads services for the selected city before any slots request", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.mocked(globalThis.fetch);

    render(<CabinetBookingEntry defaultName="" defaultPhone="" />);
    await user.click(screen.getByRole("button", { name: "Записаться на приём" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Очный приём" }));

    const moscow = await within(dialog).findByRole("button", { name: "Москва" });
    await user.click(moscow);

    await within(dialog).findByRole("button", { name: /Сеанс/ });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/booking/catalog/services?"),
        expect.anything(),
      );
    });

    expect(slotFetchCalls(fetchSpy)).toHaveLength(0);
  });

  it("requests slots only after a branch service is selected", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.mocked(globalThis.fetch);

    render(<CabinetBookingEntry defaultName="" defaultPhone="" />);
    await user.click(screen.getByRole("button", { name: "Записаться на приём" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Очный приём" }));
    await user.click(await within(dialog).findByRole("button", { name: "Москва" }));

    const serviceBtn = await within(dialog).findByRole("button", { name: /Сеанс \(60 мин\.\)/ });
    await user.click(serviceBtn);

    await waitFor(() => {
      const urls = slotFetchCalls(fetchSpy);
      expect(urls.some((u) => u.includes(`branchServiceId=${BS_ID}`))).toBe(true);
    });
  });
});
