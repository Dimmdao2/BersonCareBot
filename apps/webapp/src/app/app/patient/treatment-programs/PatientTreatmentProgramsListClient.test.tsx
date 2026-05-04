/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TreatmentProgramInstanceDetail, TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import {
  PatientTreatmentProgramsListClient,
  patientProgramsListCurrentStageTitle,
} from "./PatientTreatmentProgramsListClient";

const now = "2026-01-01T00:00:00.000Z";

function makeDetailWithPipelineStage(
  stageStatus: "available" | "in_progress",
  sortOrder: number,
  title: string,
): TreatmentProgramInstanceDetail {
  const stageId = "22222222-2222-4222-8222-222222222222";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId: null,
    assignedBy: null,
    title: "Программа",
    status: "active",
    createdAt: now,
    updatedAt: now,
    patientPlanLastOpenedAt: null,
    stages: [
      {
        id: stageId,
        instanceId: "11111111-1111-4111-8111-111111111111",
        sourceStageId: null,
        title,
        description: null,
        sortOrder,
        localComment: null,
        skipReason: null,
        status: stageStatus,
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

describe("patientProgramsListCurrentStageTitle", () => {
  it("returns title of current working pipeline stage", () => {
    const d = makeDetailWithPipelineStage("in_progress", 1, "Этап работы");
    expect(patientProgramsListCurrentStageTitle(d)).toBe("Этап работы");
  });

  it("does not use stage zero as current stage", () => {
    const d: TreatmentProgramInstanceDetail = {
      ...makeDetailWithPipelineStage("available", 1, "Первый этап"),
      stages: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          instanceId: "11111111-1111-4111-8111-111111111111",
          sourceStageId: null,
          title: "Общие",
          description: null,
          sortOrder: 0,
          localComment: null,
          skipReason: null,
          status: "available",
          startedAt: null,
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          groups: [],
          items: [
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              stageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
        {
          id: "22222222-2222-4222-8222-222222222222",
          instanceId: "11111111-1111-4111-8111-111111111111",
          sourceStageId: null,
          title: "Рабочий",
          description: null,
          sortOrder: 1,
          localComment: null,
          skipReason: null,
          status: "available",
          startedAt: null,
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          groups: [],
          items: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              stageId: "22222222-2222-4222-8222-222222222222",
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
    expect(patientProgramsListCurrentStageTitle(d)).toBe("Рабочий");
  });
});

describe("PatientTreatmentProgramsListClient", () => {
  it("renders empty state with messages link when no active program", () => {
    render(
      <PatientTreatmentProgramsListClient hero={null} archived={[]} messagesHref="/app/patient/messages" />,
    );
    expect(screen.getByText(/Здесь появится программа после назначения врачом/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Написать в чат клиники/i });
    expect(link).toHaveAttribute("href", "/app/patient/messages");
  });

  it("renders hero with current stage, plan nudge, and CTA", () => {
    render(
      <PatientTreatmentProgramsListClient
        hero={{
          instanceId: "11111111-1111-4111-8111-111111111111",
          title: "Моя программа",
          currentStageTitle: "Этап 2",
          planUpdatedLabel: "План обновлён 1 янв.",
        }}
        archived={[]}
        messagesHref="/app/patient/messages"
      />,
    );
    expect(screen.getByRole("heading", { name: "Моя программа" })).toBeInTheDocument();
    expect(screen.getByText(/Текущий этап:/)).toBeInTheDocument();
    expect(screen.getByText("Этап 2")).toBeInTheDocument();
    expect(screen.getByText("План обновлён 1 янв.")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Открыть программу/i });
    expect(cta.getAttribute("href")).toContain("11111111-1111-4111-8111-111111111111");
  });

  it("renders completed programs inside closed details", () => {
    const archived: TreatmentProgramInstanceSummary[] = [
      {
        id: "99999999-9999-4999-8999-999999999999",
        patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        templateId: null,
        assignedBy: null,
        title: "Старая",
        status: "completed",
        createdAt: now,
        updatedAt: now,
        patientPlanLastOpenedAt: null,
      },
    ];
    const { container } = render(
      <PatientTreatmentProgramsListClient hero={null} archived={archived} messagesHref="/app/patient/messages" />,
    );
    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    expect(details!.open).toBe(false);
    expect(screen.getByText("Завершённые программы")).toBeInTheDocument();
    expect(screen.getByText("Старая")).toBeInTheDocument();
  });
});
