/** @vitest-environment jsdom */
/**
 * PatientTabOverview — Package KPI widget tests (ST-07, #386).
 *
 * Covers:
 *   1. Active package with balance → shows "Осталось N визитов:" + per-service остаток.
 *   2. Active package using displayRemaining (preferred over remaining).
 *   3. No active package → shows "—" in value + "абонемент не активен" in hint.
 *   4. Active package without balance → shows unknown remaining.
 *   5. Multiple active packages → renders package details through comma.
 *   6. Multiple balance items → sums displayRemaining.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Heavy module mocks (must be top-level so vi.mock hoisting works)
// ---------------------------------------------------------------------------

vi.mock("@/app/app/doctor/clients/DoctorClientSupportPanel", () => ({
  DoctorClientSupportPanel: () => <div data-testid="mock-support-panel" />,
}));

vi.mock("@/shared/ui/doctor/media/DoctorCatalogMediaStaticThumb", () => ({
  DoctorCatalogMediaStaticThumb: () => <div />,
}));

vi.mock("@/app/app/patient/treatment/stageItemSnapshot", () => ({
  parseCatalogMediaRows: () => [],
}));

// ---------------------------------------------------------------------------
// Import component once (mocks are already set up)
// ---------------------------------------------------------------------------

import { PatientTabOverview } from "@/app/app/doctor/patients/[userId]/tabs/PatientTabOverview";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PackageMockItem = {
  id: string;
  displayNumber?: number | null;
  title?: string | null;
  status: string;
  soldAt?: string | null;
  validUntil?: string | null;
  balance?: {
    items: Array<{
      quantityInitial?: number | null;
      remaining?: number | null;
      displayRemaining?: number | null;
      serviceTitle?: string | null;
    }>;
  } | null;
};

// ---------------------------------------------------------------------------
// Fetch stub helpers
// ---------------------------------------------------------------------------

/** Build a minimal fetch mock with configurable package response. */
function buildFetchMock(packages: PackageMockItem[] = []) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = typeof url === "string" ? url : String(url);

    if (u.includes("exercise-calendar")) {
      return new Response(JSON.stringify({ ok: true, days: [] }), { status: 200 });
    }
    if (u.includes("conversations/ensure")) {
      return new Response(
        JSON.stringify({ ok: true, messages: [], unreadFromUserCount: 0 }),
        { status: 200 },
      );
    }
    if (u.includes("patient-packages")) {
      return new Response(JSON.stringify({ ok: true, packages }), { status: 200 });
    }
    if (u.includes("treatment-program-instances")) {
      return new Response(JSON.stringify({ ok: true, items: [] }), { status: 200 });
    }
    if (u.includes("/clinical")) {
      return new Response(
        JSON.stringify({ ok: true, state: { complaints: [] }, visits: [] }),
        { status: 200 },
      );
    }
    if (u.includes("/appointments")) {
      return new Response(JSON.stringify({ appointments: [] }), { status: 200 });
    }
    if (u.includes("/notes")) {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true, note: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, notes: [] }), { status: 200 });
    }
    if (u.includes("/tasks")) {
      return new Response(JSON.stringify({ ok: true, tasks: [] }), { status: 200 });
    }
    if (u.includes("proactive-insights")) {
      return new Response(JSON.stringify({ ok: true, signals: [] }), { status: 200 });
    }
    if (u.includes("program-activity")) {
      return new Response(
        JSON.stringify({ ok: true, activity: { lastMark: null, unreadCount: 0 } }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("PatientTabOverview — Package KPI widget (ST-07)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ── Test 1: active package → shows remaining visit count, services, number and sold date ──
  it("shows remaining visits, service balance, package number and sold date for an active package", async () => {
    vi.stubGlobal("fetch", buildFetchMock([
      {
        id: "pkg-1",
        displayNumber: 1,
        title: "Базовый курс",
        status: "active",
        soldAt: "2026-06-01T00:00:00.000Z",
        validUntil: null,
        balance: {
          items: [
            { quantityInitial: 10, remaining: 7, displayRemaining: 8, serviceTitle: "ЛФК" },
          ],
        },
      },
    ]));

    render(<PatientTabOverview userId="u-pkg-test-1" />);

    // Prefer displayRemaining (8) over remaining (7)
    await waitFor(() => {
      expect(screen.getByText("Осталось 8 визитов:")).toBeInTheDocument();
    });
    expect(screen.getByText("8 x ЛФК аб #001 от 01.06.2026")).toBeInTheDocument();
  });

  // ── Test 2: falls back to remaining when displayRemaining is absent ──
  it("falls back to remaining when displayRemaining is not provided", async () => {
    vi.stubGlobal("fetch", buildFetchMock([
      {
        id: "pkg-2",
        displayNumber: 2,
        title: "Курс без displayRemaining",
        status: "active",
        soldAt: "2026-06-02T00:00:00.000Z",
        validUntil: null,
        balance: {
          items: [
            { quantityInitial: 5, remaining: 3, serviceTitle: "Массаж" },
          ],
        },
      },
    ]));

    render(<PatientTabOverview userId="u-pkg-test-2" />);

    await waitFor(() => {
      expect(screen.getByText("Осталось 3 визитов:")).toBeInTheDocument();
    });
    expect(screen.getByText("3 x Массаж аб #002 от 02.06.2026")).toBeInTheDocument();
  });

  // ── Test 3: no active package → "—" and "абонемент не активен" ──
  it("shows '—' and 'абонемент не активен' when no active package", async () => {
    vi.stubGlobal("fetch", buildFetchMock([]));

    render(<PatientTabOverview userId="u-pkg-test-3" />);

    await waitFor(() => {
      expect(screen.getByText("абонемент не активен")).toBeInTheDocument();
    });
  });

  // ── Test 4: active package without balance items → shows unknown remaining ──
  it("shows unknown remaining when balance items are empty", async () => {
    vi.stubGlobal("fetch", buildFetchMock([
      {
        id: "pkg-3",
        displayNumber: 3,
        title: "Безлимитный",
        status: "active",
        soldAt: "2026-06-03T00:00:00.000Z",
        validUntil: null,
        balance: { items: [] },
      },
    ]));

    render(<PatientTabOverview userId="u-pkg-test-4" />);

    await waitFor(() => {
      expect(screen.getByText("Осталось — визитов:")).toBeInTheDocument();
    });
    expect(screen.getByText("аб #003 от 03.06.2026")).toBeInTheDocument();
  });

  // ── Test 5: multiple active packages → details are comma-separated ──
  it("renders multiple active package details separated by comma", async () => {
    vi.stubGlobal("fetch", buildFetchMock([
      {
        id: "pkg-4",
        displayNumber: 4,
        title: "Первый",
        status: "active",
        soldAt: "2026-06-04T00:00:00.000Z",
        validUntil: null,
        balance: {
          items: [{ quantityInitial: 10, remaining: 5, displayRemaining: 6, serviceTitle: "ЛФК" }],
        },
      },
      {
        id: "pkg-5",
        displayNumber: 5,
        title: "Второй",
        status: "activated",
        soldAt: "2026-06-05T00:00:00.000Z",
        validUntil: null,
        balance: {
          items: [{ quantityInitial: 4, remaining: 2, displayRemaining: 3, serviceTitle: "Массаж" }],
        },
      },
    ]));

    render(<PatientTabOverview userId="u-pkg-test-5" />);

    await waitFor(() => {
      expect(screen.getByText("Осталось 9 визитов:")).toBeInTheDocument();
    });
    expect(screen.getByText("6 x ЛФК аб #004 от 04.06.2026, 3 x Массаж аб #005 от 05.06.2026")).toBeInTheDocument();
  });

  // ── Test 6: multiple balance items → sums displayRemaining ──
  it("sums balance across multiple items", async () => {
    vi.stubGlobal("fetch", buildFetchMock([
      {
        id: "pkg-5",
        displayNumber: 6,
        title: "Комплекс",
        status: "active",
        soldAt: "2026-06-06T00:00:00.000Z",
        validUntil: null,
        balance: {
          items: [
            { quantityInitial: 5, remaining: 3, displayRemaining: 4, serviceTitle: "ЛФК" },
            { quantityInitial: 3, remaining: 1, displayRemaining: 2, serviceTitle: "Массаж" },
          ],
        },
      },
    ]));

    render(<PatientTabOverview userId="u-pkg-test-6" />);

    // Total: displayRemaining = 4+2=6
    await waitFor(() => {
      expect(screen.getByText("Осталось 6 визитов:")).toBeInTheDocument();
    });
    expect(screen.getByText("4 x ЛФК, 2 x Массаж аб #006 от 06.06.2026")).toBeInTheDocument();
  });
});
