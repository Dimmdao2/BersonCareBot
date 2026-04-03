/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DoctorOnlineIntakeClient } from "./DoctorOnlineIntakeClient";

describe("DoctorOnlineIntakeClient", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/doctor/online-intake/") && !url.endsWith("/api/doctor/online-intake")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: "00000000-0000-0000-0000-0000000000cc",
            type: "lfk",
            status: "new",
            patientName: "Деталь Имя",
            patientPhone: "+79005550123",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            description: "d",
            statusHistory: [],
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "00000000-0000-0000-0000-0000000000cc",
              type: "lfk",
              status: "new",
              summary: "Кратко о симптомах",
              patientName: "Список Имя",
              patientPhone: "+79007770088",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          total: 1,
          page: 1,
          totalPages: 1,
        }),
      } as Response);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("renders patientName and patientPhone from list API", async () => {
    render(<DoctorOnlineIntakeClient />);
    await waitFor(() => {
      expect(screen.getByText("Список Имя")).toBeInTheDocument();
    });
    expect(screen.getByText("+79007770088")).toBeInTheDocument();
  });

  it("loads detail for deep-linked requestId when not in filtered list", async () => {
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/00000000-0000-0000-0000-0000000000dd")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: "00000000-0000-0000-0000-0000000000dd",
            type: "lfk",
            status: "closed",
            patientName: "Deep Имя",
            patientPhone: "+79001112233",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            description: "Текст по ссылке",
            statusHistory: [],
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [],
          total: 0,
          page: 1,
          totalPages: 0,
        }),
      } as Response);
    }) as typeof fetch;

    render(
      <DoctorOnlineIntakeClient initialOpenRequestId="00000000-0000-0000-0000-0000000000dd" />,
    );
    await waitFor(() => {
      expect(screen.getByText("Заявка по ссылке")).toBeInTheDocument();
    });
    expect(screen.getByText("Deep Имя")).toBeInTheDocument();
    expect(screen.getByText("Текст по ссылке")).toBeInTheDocument();
  });
});
