/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { PatientTreatmentProgramDetailClient } from "./PatientTreatmentProgramDetailClient";

const now = "2026-01-01T00:00:00.000Z";

function makeInstance(over: Partial<TreatmentProgramInstanceDetail> = {}): TreatmentProgramInstanceDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId: null,
    assignedBy: null,
    title: "Программа",
    status: "active",
    createdAt: now,
    updatedAt: now,
    stages: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        instanceId: "11111111-1111-4111-8111-111111111111",
        sourceStageId: null,
        title: "Этап 1",
        description: null,
        sortOrder: 0,
        localComment: null,
        skipReason: null,
        status: "available",
        goals: "Снять отёк",
        objectives: "- 3 раза в неделю",
        expectedDurationDays: 7,
        expectedDurationText: "неделя",
        items: [],
      },
    ],
    ...over,
  };
}

describe("PatientTreatmentProgramDetailClient", () => {
  it("renders stage goals/objectives/duration when set (A1)", () => {
    render(
      <PatientTreatmentProgramDetailClient
        initial={makeInstance()}
        initialTestResults={[]}
      />,
    );
    expect(screen.getByText("Снять отёк")).toBeInTheDocument();
    expect(screen.getByText("- 3 раза в неделю")).toBeInTheDocument();
    expect(screen.getByText("7 дн. · неделя")).toBeInTheDocument();
  });

  it("does not render empty A1 stage header block", () => {
    render(
      <PatientTreatmentProgramDetailClient
        initial={makeInstance({
          stages: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              instanceId: "11111111-1111-4111-8111-111111111111",
              sourceStageId: null,
              title: "Пустой этап",
              description: null,
              sortOrder: 0,
              localComment: null,
              skipReason: null,
              status: "available",
              goals: null,
              objectives: null,
              expectedDurationDays: null,
              expectedDurationText: null,
              items: [],
            },
          ],
        })}
        initialTestResults={[]}
      />,
    );
    expect(screen.queryByText("Цель")).not.toBeInTheDocument();
    expect(screen.queryByText("Задачи")).not.toBeInTheDocument();
    expect(screen.queryByText("Ожидаемый срок")).not.toBeInTheDocument();
  });
});
