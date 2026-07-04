/** @vitest-environment jsdom */
/**
 * PatientTabKarta — ST-05: «По абонементу» badge on visit cards.
 *
 * Covers:
 *   1. Visit with visit.package set  → badge «По абонементу» rendered.
 *   2. Visit without visit.package   → no badge.
 *   3. Badge carries title attr = package title (tooltip on hover).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Visit } from "@/modules/patient-clinical/ports";

// ---------------------------------------------------------------------------
// Heavy module mocks
// ---------------------------------------------------------------------------

vi.mock("@/shared/ui/doctor/DoctorDatePicker", () => ({
  DoctorDatePicker: () => <div data-testid="mock-date-picker" />,
}));

vi.mock(
  "@/app/app/doctor/patients/[userId]/tabs/karta/NewVisitPanel",
  () => ({
    NewVisitPanel: () => <div data-testid="mock-new-visit-panel" />,
  }),
);

// ---------------------------------------------------------------------------
// Fetch stub — clinical endpoint returns SSR visits so no extra fetch fires
// ---------------------------------------------------------------------------

function stubFetch(visits: Visit[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/clinical")) {
        return new Response(
          JSON.stringify({ ok: true, state: { complaints: [], diagnoses: [] }, visits }),
          { status: 200 },
        );
      }
      if (u.includes("/comorbidities")) {
        return new Response(JSON.stringify({ comorbidities: [] }), { status: 200 });
      }
      if (u.includes("/anamnesis")) {
        return new Response(
          JSON.stringify({ ok: true, anamnesis: { trauma: [], illness: [], lifestyle: [] } }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
}

// ---------------------------------------------------------------------------
// Minimal Visit factory
// ---------------------------------------------------------------------------

function makeVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: "visit-1",
    date: "22 января 2026",
    type: "repeat",
    location: "Кабинет 1",
    duration: "60 мин",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PatientTabKarta — «По абонементу» badge (ST-05)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function renderKarta(visits: Visit[]) {
    // Stub fetch before rendering so SSR-skip path works
    stubFetch(visits);
    const { PatientTabKarta } = await import(
      "@/app/app/doctor/patients/[userId]/tabs/PatientTabKarta"
    );
    return render(
      <PatientTabKarta
        userId="user-test-1"
        initialClinicalState={{ complaints: [], diagnoses: [] }}
        initialVisits={visits}
      />,
    );
  }

  it("shows «По абонементу» badge when visit.package is set", async () => {
    const visit = makeVisit({ package: { title: "Индивидуальный абонемент" } });
    await renderKarta([visit]);
    const badge = screen.getByText("По абонементу");
    expect(badge).toBeDefined();
  });

  it("badge title attribute contains the package title for tooltip", async () => {
    const packageTitle = "VIP абонемент";
    const visit = makeVisit({ package: { title: packageTitle } });
    await renderKarta([visit]);
    const badge = screen.getByText("По абонементу");
    expect(badge.getAttribute("title")).toBe(packageTitle);
  });

  it("does NOT render badge when visit.package is null", async () => {
    const visit = makeVisit({ package: null });
    await renderKarta([visit]);
    expect(screen.queryByText("По абонементу")).toBeNull();
  });

  it("does NOT render badge when visit.package is absent (undefined)", async () => {
    const visit = makeVisit();
    // package field omitted
    await renderKarta([visit]);
    expect(screen.queryByText("По абонементу")).toBeNull();
  });
});
