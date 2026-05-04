/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    const e = new Error("NEXT_NOT_FOUND");
    throw e;
  }),
);

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/shared/ui/AppShell", () => ({
  AppShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <span data-testid="shell-title">{title}</span>
      {children}
    </div>
  ),
}));

const patientSession = {
  user: {
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role: "client" as const,
    displayName: "Patient",
    bindings: {},
  },
  issuedAt: 0,
  expiresAt: 9_999_999_999,
};

vi.mock("@/app-layer/guards/requireRole", () => ({
  getOptionalPatientSession: vi.fn(async () => patientSession),
  patientRscPersonalDataGate: vi.fn(async () => "allow" as const),
}));

const getInstanceForPatientMock = vi.hoisted(() => vi.fn());
const patientPlanUpdatedBadgeForInstanceMock = vi.hoisted(() => vi.fn());
const listTestResultsForInstanceMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: {
      getInstanceForPatient: getInstanceForPatientMock,
      patientPlanUpdatedBadgeForInstance: patientPlanUpdatedBadgeForInstanceMock,
    },
    treatmentProgramProgress: {
      listTestResultsForInstance: listTestResultsForInstanceMock,
    },
  }),
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
}));

vi.mock("../PatientTreatmentProgramDetailClient", () => ({
  PatientTreatmentProgramDetailClient: ({
    planUpdatedLabel,
    initial,
  }: {
    planUpdatedLabel: string | null;
    initial: { title: string };
  }) => (
    <div data-testid="detail-client">
      <span data-testid="detail-title">{initial.title}</span>
      {planUpdatedLabel ? <span data-testid="plan-nudge">{planUpdatedLabel}</span> : <span data-testid="no-plan-nudge" />}
    </div>
  ),
}));

const now = "2026-01-01T00:00:00.000Z";

function minimalActiveDetail(): TreatmentProgramInstanceDetail {
  const stageId = "22222222-2222-4222-8222-222222222222";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId: null,
    assignedBy: null,
    title: "Программа деталь",
    status: "active",
    createdAt: now,
    updatedAt: now,
    patientPlanLastOpenedAt: null,
    stages: [
      {
        id: stageId,
        instanceId: "11111111-1111-4111-8111-111111111111",
        sourceStageId: null,
        title: "Этап 1",
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: "in_progress",
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            stageId,
            itemType: "recommendation",
            itemRefId: "44444444-4444-4444-8444-444444444444",
            sortOrder: 0,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: {},
            completedAt: null,
            isActionable: true,
            status: "active",
            groupId: null,
            createdAt: now,
            lastViewedAt: null,
            effectiveComment: null,
          },
        ],
      },
    ],
  };
}

import PatientTreatmentProgramDetailPage from "./page";

describe("PatientTreatmentProgramDetailPage / nudge resilience", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    getInstanceForPatientMock.mockResolvedValue(minimalActiveDetail());
    listTestResultsForInstanceMock.mockResolvedValue([]);
  });

  it("renders detail when patientPlanUpdatedBadgeForInstance throws (no 404, no plan badge)", async () => {
    patientPlanUpdatedBadgeForInstanceMock.mockRejectedValue(new Error("nudge failed"));
    const ui = await PatientTreatmentProgramDetailPage({
      params: Promise.resolve({ instanceId: "11111111-1111-4111-8111-111111111111" }),
    });
    render(ui);
    expect(screen.getByTestId("detail-title")).toHaveTextContent("Программа деталь");
    expect(screen.getByTestId("no-plan-nudge")).toBeInTheDocument();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("calls notFound when instance is missing", async () => {
    patientPlanUpdatedBadgeForInstanceMock.mockResolvedValue({ show: false });
    getInstanceForPatientMock.mockResolvedValue(null);
    await expect(
      PatientTreatmentProgramDetailPage({
        params: Promise.resolve({ instanceId: "missing-id" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });
});
