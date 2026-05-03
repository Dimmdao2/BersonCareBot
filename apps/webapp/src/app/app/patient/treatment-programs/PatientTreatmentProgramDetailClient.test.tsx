/** @vitest-environment jsdom */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { PatientTreatmentProgramDetailClient } from "./PatientTreatmentProgramDetailClient";

const now = "2026-01-01T00:00:00.000Z";

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/checklist-today")) {
      return new Response(JSON.stringify({ ok: true, doneItemIds: [] }), { status: 200 });
    }
    if (url.includes("/plan-opened")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.includes("/mark-viewed")) {
      return new Response(JSON.stringify({ ok: true, updated: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: false }), { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

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
    patientPlanLastOpenedAt: null,
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
        groups: [],
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
              groups: [],
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

  it("does not POST plan-opened when program is not active (A5 POST-AUDIT)", async () => {
    const fetchMock = vi.mocked(global.fetch);
    render(
      <PatientTreatmentProgramDetailClient
        initial={makeInstance({ status: "completed" })}
        initialTestResults={[]}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const planOpenedCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/plan-opened"));
    expect(planOpenedCalls).toHaveLength(0);
  });
});
