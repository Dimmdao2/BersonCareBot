/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DoctorClientMembershipsPanel } from "./DoctorClientMembershipsPanel";

const platformUserId = "00000000-0000-4000-8000-000000000099";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function mockFetchResponse(data: unknown): Response {
  return { ok: true, json: async () => data } as Response;
}

describe("DoctorClientMembershipsPanel", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (/\/patient-packages(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, packages: [] });
      }
      if (/\/booking-engine\/services(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, services: [] });
      }
      if (/\/booking-engine\/packages(\?|$)/.test(url)) {
        return mockFetchResponse({ ok: true, packages: [] });
      }
      return mockFetchResponse({ ok: true });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders doctor membership workflow sections", async () => {
    render(<DoctorClientMembershipsPanel platformUserId={platformUserId} />);
    expect(await screen.findByText("Нет активных абонементов.")).toBeTruthy();
    expect(screen.getByText("Назначить из каталога")).toBeTruthy();
    expect(screen.getByText("Индивидуальный абонемент")).toBeTruthy();
    expect(screen.getByText("Списать сеанс по абонементу")).toBeTruthy();
    expect(screen.getByText("Отвязать / вернуть сеанс")).toBeTruthy();
  });
});
