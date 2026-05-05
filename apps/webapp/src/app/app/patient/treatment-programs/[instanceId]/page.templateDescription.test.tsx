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
  AppShell: ({
    children,
    patientSuppressShellTitle,
  }: {
    children: React.ReactNode;
    patientSuppressShellTitle?: boolean;
  }) => (
    <div data-testid="app-shell" data-suppress-shell-title={patientSuppressShellTitle ? "1" : "0"}>
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
const getTemplateMock = vi.hoisted(() => vi.fn());
const listProgramEventsMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: {
      getInstanceForPatient: getInstanceForPatientMock,
      patientPlanUpdatedBadgeForInstance: patientPlanUpdatedBadgeForInstanceMock,
      listProgramEvents: listProgramEventsMock,
    },
    treatmentProgramProgress: {
      listTestResultsForInstance: listTestResultsForInstanceMock,
    },
    treatmentProgram: {
      getTemplate: getTemplateMock,
    },
  }),
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
}));

vi.mock("../PatientTreatmentProgramDetailClient", () => ({
  PatientTreatmentProgramDetailClient: ({
    programDescription,
    initial,
  }: {
    programDescription?: string | null;
    initial: { title: string };
  }) => (
    <div data-testid="detail-client">
      <span data-testid="detail-title">{initial.title}</span>
      {programDescription ? <span data-testid="program-description">{programDescription}</span> : null}
    </div>
  ),
}));

const now = "2026-01-01T00:00:00.000Z";
const templateUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function minimalActiveDetail(templateId: string | null): TreatmentProgramInstanceDetail {
  const stageId = "22222222-2222-4222-8222-222222222222";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId,
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

describe("PatientTreatmentProgramDetailPage / template description (RSC)", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    getTemplateMock.mockReset();
    listProgramEventsMock.mockResolvedValue([]);
    getInstanceForPatientMock.mockResolvedValue(minimalActiveDetail(templateUuid));
    patientPlanUpdatedBadgeForInstanceMock.mockResolvedValue({ show: false });
    listTestResultsForInstanceMock.mockResolvedValue([]);
  });

  it("loads template description via getTemplate when templateId is set and passes trimmed text to client", async () => {
    getTemplateMock.mockResolvedValue({
      id: templateUuid,
      description: "  Текст описания шаблона  ",
    });

    const ui = await PatientTreatmentProgramDetailPage({
      params: Promise.resolve({ instanceId: "11111111-1111-4111-8111-111111111111" }),
    });
    render(ui);

    expect(getTemplateMock).toHaveBeenCalledWith(templateUuid);
    expect(screen.getByTestId("program-description")).toHaveTextContent("Текст описания шаблона");
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-suppress-shell-title", "1");
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("does not call getTemplate when templateId is null", async () => {
    getInstanceForPatientMock.mockResolvedValue(minimalActiveDetail(null));

    const ui = await PatientTreatmentProgramDetailPage({
      params: Promise.resolve({ instanceId: "11111111-1111-4111-8111-111111111111" }),
    });
    render(ui);

    expect(getTemplateMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("program-description")).not.toBeInTheDocument();
  });

  it("survives getTemplate failure without 404 and passes null description", async () => {
    getTemplateMock.mockRejectedValue(new Error("template load failed"));

    const ui = await PatientTreatmentProgramDetailPage({
      params: Promise.resolve({ instanceId: "11111111-1111-4111-8111-111111111111" }),
    });
    render(ui);

    expect(getTemplateMock).toHaveBeenCalled();
    expect(screen.queryByTestId("program-description")).not.toBeInTheDocument();
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
