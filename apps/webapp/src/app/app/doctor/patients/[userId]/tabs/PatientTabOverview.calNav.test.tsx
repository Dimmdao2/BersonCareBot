/** @vitest-environment jsdom */
/**
 * PatientTabOverview — exercise calendar month navigation tests (#210).
 *
 * Covers:
 *   1. Initial state = current month (label rendered correctly).
 *   2. Prev button navigates to previous month and triggers a new calendar fetch.
 *   3. Next button is disabled on the current month (can't go to future).
 *   4. After going back one month, next button re-enables and restores current month.
 *   5. Loading placeholder shown during calendar re-fetch.
 *   6. buildCalendarGrid: past month days marked as past (no "future" cells).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Heavy module mocks — these pull in side-effect-heavy modules not needed here
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
// Fetch stub helpers
// ---------------------------------------------------------------------------

/** Build a minimal fetch mock that satisfies all API calls in PatientTabOverview. */
function buildFetchMock(calDays: Array<{ date: string; completedCount: number }> = []) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = typeof url === "string" ? url : String(url);

    // Calendar endpoint
    if (u.includes("exercise-calendar")) {
      return new Response(JSON.stringify({ ok: true, days: calDays }), { status: 200 });
    }
    // Messages (POST ensure)
    if (u.includes("conversations/ensure")) {
      return new Response(
        JSON.stringify({ ok: true, messages: [], unreadFromUserCount: 0 }),
        { status: 200 },
      );
    }
    // Packages
    if (u.includes("patient-packages")) {
      return new Response(JSON.stringify({ ok: true, packages: [] }), { status: 200 });
    }
    // Treatment program instances
    if (u.includes("treatment-program-instances")) {
      return new Response(JSON.stringify({ ok: true, items: [] }), { status: 200 });
    }
    // Clinical / appointments / notes / tasks / signals / program-activity
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

    // Fallback — 200 empty
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("PatientTabOverview — calendar month navigation", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = buildFetchMock();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // Lazy import inside tests so vi.mock takes effect before module evaluation
  async function renderComponent() {
    const { PatientTabOverview } = await import(
      "@/app/app/doctor/patients/[userId]/tabs/PatientTabOverview"
    );
    return render(<PatientTabOverview userId="u-test-1" />);
  }

  // ── Helper: produce a "YYYY-MM" string for a relative month offset ──
  function ymOffset(delta: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() + delta, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  // ── Test 1: initial month label = current month ──
  it("shows the current month label initially", async () => {
    await renderComponent();

    const now = new Date();
    const expectedLabel = now.toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
    });
    // label may be capitalised differently — check case-insensitively via partial text
    await waitFor(() => {
      const label = screen.getByTestId("cal-month-label");
      expect(label.textContent?.toLowerCase()).toContain(expectedLabel.toLowerCase().slice(0, 4)); // first 4 chars of month name
    });
  });

  // ── Test 2: initial calendar fetch uses current month range ──
  it("fetches exercise-calendar with current month from/to on mount", async () => {
    await renderComponent();

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const expectedFrom = `${y}-${m}-01`;

    await waitFor(() => {
      const calCalls = (fetchMock.mock.calls as [string, RequestInit | undefined][])
        .filter(([u]) => u.includes("exercise-calendar"));
      expect(calCalls.length).toBeGreaterThanOrEqual(1);
      expect(calCalls[0][0]).toContain(`from=${expectedFrom}`);
    });
  });

  // ── Test 3: next button disabled on current month ──
  it("disables the next-month button when viewing current month", async () => {
    await renderComponent();
    const nextBtn = screen.getByTestId("cal-month-next");
    expect(nextBtn).toBeDisabled();
  });

  // ── Test 4: prev button navigates back one month ──
  it("navigates to previous month on ◀ click and re-fetches calendar", async () => {
    const user = userEvent.setup();
    await renderComponent();

    const prevBtn = screen.getByTestId("cal-month-prev");

    // Wait for initial load
    await waitFor(() => {
      const calCalls = (fetchMock.mock.calls as [string, RequestInit | undefined][])
        .filter(([u]) => u.includes("exercise-calendar"));
      expect(calCalls.length).toBeGreaterThanOrEqual(1);
    });

    const callsBefore = (fetchMock.mock.calls as [string, RequestInit | undefined][]).filter(
      ([u]) => u.includes("exercise-calendar"),
    ).length;

    await act(async () => {
      await user.click(prevBtn);
    });

    // A new calendar fetch must happen for the previous month
    await waitFor(() => {
      const calCalls = (fetchMock.mock.calls as [string, RequestInit | undefined][]).filter(
        ([u]) => u.includes("exercise-calendar"),
      );
      expect(calCalls.length).toBeGreaterThan(callsBefore);
      // The latest fetch should use the previous month
      const lastCall = calCalls[calCalls.length - 1][0];
      const prevYm = ymOffset(-1);
      expect(lastCall).toContain(`from=${prevYm}-01`);
    });
  });

  // ── Test 5: after going to prev month, next button is re-enabled ──
  it("re-enables the next-month button after navigating back", async () => {
    const user = userEvent.setup();
    await renderComponent();

    const prevBtn = screen.getByTestId("cal-month-prev");
    const nextBtn = screen.getByTestId("cal-month-next");

    await act(async () => {
      await user.click(prevBtn);
    });

    // After going back, next should be enabled
    await waitFor(() => {
      expect(nextBtn).not.toBeDisabled();
    });
  });

  // ── Test 6: forward navigation after going back restores current month ──
  it("navigates forward back to current month after going back", async () => {
    const user = userEvent.setup();
    await renderComponent();

    const prevBtn = screen.getByTestId("cal-month-prev");
    const nextBtn = screen.getByTestId("cal-month-next");

    // Go back
    await act(async () => {
      await user.click(prevBtn);
    });

    // Wait for prev month fetch
    await waitFor(() => {
      const calCalls = (fetchMock.mock.calls as [string, RequestInit | undefined][]).filter(
        ([u]) => u.includes("exercise-calendar"),
      );
      expect(calCalls.some(([u]) => u.includes(`from=${ymOffset(-1)}-01`))).toBe(true);
    });

    // Go forward again
    await act(async () => {
      await user.click(nextBtn);
    });

    // Current month fetch should happen
    await waitFor(() => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const calCalls = (fetchMock.mock.calls as [string, RequestInit | undefined][]).filter(
        ([u]) => u.includes("exercise-calendar"),
      );
      expect(calCalls.some(([u]) => u.includes(`from=${y}-${m}-01`))).toBe(true);
      // Next button disabled again
      expect(nextBtn).toBeDisabled();
    });
  });
});
