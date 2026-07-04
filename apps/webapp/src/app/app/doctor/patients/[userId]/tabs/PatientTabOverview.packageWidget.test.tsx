/** @vitest-environment jsdom */
/**
 * PatientTabOverview — Package KPI widget tests (ST-07, #386).
 *
 * Covers:
 *   1. Active package with balance → shows "X из Y" in value + title in hint.
 *   2. Active package using displayRemaining (preferred over remaining).
 *   3. No active package → shows "—" in value + "абонемент не активен" in hint.
 *   4. Active package without quantityInitial → shows "активен".
 *   5. Package with title longer than 28 chars → hint is truncated with "…".
 *   6. Multiple balance items → sums displayRemaining and quantityInitial.
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
  title?: string | null;
  status: string;
  validUntil?: string | null;
  balance?: {
    items: Array<{
      quantityInitial?: number | null;
      remaining?: number | null;
      displayRemaining?: number | null;
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

  // ── Test 1: active package → shows displayRemaining из quantityInitial + title in hint ──
  it("shows 'X из Y' (displayRemaining) and package title in hint for an active package", async () => {
    vi.stubGlobal("fetch", buildFetchMock([
      {
        id: "pkg-1",
        title: "Базовый курс",
        status: "active",
        validUntil: null,
        balance: {
          items: [
            { quantityInitial: 10, remaining: 7, displayRemaining: 8 },
          ],
        },
      },
    ]));

    render(<PatientTabOverview userId="u-pkg-test-1" />);

    // Prefer displayRemaining (8) over remaining (7)
    await waitFor(() => {
      expect(screen.getByText("8 из 10")).toBeInTheDocument();
    });
    // Package title should appear in the hint
    expect(screen.getByText("Базовый курс")).toBeInTheDocument();
  });

  // ── Test 2: falls back to remaining when displayRemaining is absent ──
  it("falls back to remaining when displayRemaining is not provided", async () => {
    vi.stubGlobal("fetch", buildFetchMock([
      {
        id: "pkg-2",
        title: "Курс без displayRemaining",
        status: "active",
        validUntil: null,
        balance: {
          items: [
            { quantityInitial: 5, remaining: 3 },
          ],
        },
      },
    ]));

    render(<PatientTabOverview userId="u-pkg-test-2" />);

    await waitFor(() => {
      expect(screen.getByText("3 из 5")).toBeInTheDocument();
    });
  });

  // ── Test 3: no active package → "—" and "абонемент не активен" ──
  it("shows '—' and 'абонемент не активен' when no active package", async () => {
    vi.stubGlobal("fetch", buildFetchMock([]));

    render(<PatientTabOverview userId="u-pkg-test-3" />);

    await waitFor(() => {
      expect(screen.getByText("абонемент не активен")).toBeInTheDocument();
    });
  });

  // ── Test 4: active package without balance items → shows "активен" ──
  it("shows 'активен' when balance items are empty (no quantityInitial)", async () => {
    vi.stubGlobal("fetch", buildFetchMock([
      {
        id: "pkg-3",
        title: "Безлимитный",
        status: "active",
        validUntil: null,
        balance: { items: [] },
      },
    ]));

    render(<PatientTabOverview userId="u-pkg-test-4" />);

    await waitFor(() => {
      expect(screen.getByText("активен")).toBeInTheDocument();
    });
  });

  // ── Test 5: title longer than 28 chars → truncated with "…" ──
  it("truncates package title in hint when longer than 28 characters", async () => {
    const longTitle = "Очень длинное название абонемента курса";
    vi.stubGlobal("fetch", buildFetchMock([
      {
        id: "pkg-4",
        title: longTitle,
        status: "active",
        validUntil: null,
        balance: {
          items: [{ quantityInitial: 10, remaining: 5, displayRemaining: 6 }],
        },
      },
    ]));

    render(<PatientTabOverview userId="u-pkg-test-5" />);

    const expected = longTitle.slice(0, 28) + "…";
    await waitFor(() => {
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });

  // ── Test 6: multiple balance items → sums displayRemaining and quantityInitial ──
  it("sums balance across multiple items", async () => {
    vi.stubGlobal("fetch", buildFetchMock([
      {
        id: "pkg-5",
        title: "Комплекс",
        status: "active",
        validUntil: null,
        balance: {
          items: [
            { quantityInitial: 5, remaining: 3, displayRemaining: 4 },
            { quantityInitial: 3, remaining: 1, displayRemaining: 2 },
          ],
        },
      },
    ]));

    render(<PatientTabOverview userId="u-pkg-test-6" />);

    // Total: displayRemaining = 4+2=6, quantityInitial = 5+3=8
    await waitFor(() => {
      expect(screen.getByText("6 из 8")).toBeInTheDocument();
    });
  });
});
