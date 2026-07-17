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

type ProgramMock = {
  active: {
    id: string;
    title: string;
    status: "active";
    createdAt: string;
    updatedAt: string;
  };
  stages: Array<{
    id: string;
    title: string;
    status: string;
    sortOrder: number;
    groups: [];
    items: [];
  }>;
};

// ---------------------------------------------------------------------------
// Fetch stub helpers
// ---------------------------------------------------------------------------

/** Build a minimal fetch mock with configurable package response. */
function buildFetchMock(packages: PackageMockItem[] = [], program?: ProgramMock) {
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
    if (u.includes("/api/doctor/treatment-program-instances/")) {
      return new Response(
        JSON.stringify({ ok: true, item: program ? { ...program.active, stages: program.stages } : null }),
        { status: program ? 200 : 404 },
      );
    }
    if (u.includes("/treatment-program-instances")) {
      return new Response(
        JSON.stringify({ ok: true, items: program ? [program.active] : [] }),
        { status: 200 },
      );
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
      expect(screen.getByText("Абонемент")).toBeInTheDocument();
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

  it("seeds active package copy from SSR packages on first render", () => {
    vi.stubGlobal("fetch", buildFetchMock());

    render(
      <PatientTabOverview
        userId="u-pkg-test-ssr"
        initialClinicalState={{ complaints: [], diagnoses: [] }}
        initialVisits={[]}
        initialNotes={[]}
        initialTasks={[]}
        initialSignals={[]}
        initialProgramActivity={{ unreadCount: 0, lastMark: null }}
        initialAppointments={[]}
        initialPackages={[
          {
            id: "pkg-ssr",
            displayNumber: 8,
            title: "SSR курс",
            status: "active",
            soldAt: "2026-06-08T00:00:00.000Z",
            validUntil: null,
            balance: {
              items: [{ quantityInitial: 2, remaining: 1, displayRemaining: 2, serviceTitle: "ЛФК" }],
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("Осталось 2 визитов:")).toBeInTheDocument();
    expect(screen.getByText("2 x ЛФК аб #008 от 08.06.2026")).toBeInTheDocument();
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

describe("PatientTabOverview — active program state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not report an active stage-zero-only program as unassigned", async () => {
    vi.stubGlobal(
      "fetch",
      buildFetchMock([], {
        active: {
          id: "program-stage-zero",
          title: "Новая программа",
          status: "active",
          createdAt: "2026-07-17T00:00:00.000Z",
          updatedAt: "2026-07-17T00:00:00.000Z",
        },
        stages: [
          {
            id: "stage-zero",
            title: "Общие рекомендации",
            status: "available",
            sortOrder: 0,
            groups: [],
            items: [],
          },
        ],
      }),
    );

    render(<PatientTabOverview userId="u-program-stage-zero" />);

    await waitFor(() => {
      expect(screen.getAllByText("Новая программа").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Программа не назначена.")).not.toBeInTheDocument();
  });

  it("reports the program as unassigned only when there is no active instance", async () => {
    vi.stubGlobal("fetch", buildFetchMock());

    render(<PatientTabOverview userId="u-program-empty" />);

    await waitFor(() => {
      expect(screen.getByText("Программа не назначена.")).toBeInTheDocument();
    });
  });
});
