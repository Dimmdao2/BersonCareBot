/** @vitest-environment jsdom */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, fireEvent, within } from "@testing-library/react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { PatientTreatmentProgramDetailClient } from "./PatientTreatmentProgramDetailClient";

const now = "2026-01-01T00:00:00.000Z";

const detailShellProps = {
  appDisplayTimeZone: "Europe/Moscow",
  planUpdatedLabel: null as string | null,
};

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
        startedAt: null,
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
        {...detailShellProps}
      />,
    );
    // Stage 0 (sortOrder=0) is now in a Collapsible (closed by default in C3); open it first.
    fireEvent.click(screen.getByText("Рекомендации"));
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
              startedAt: null,
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
        {...detailShellProps}
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
        {...detailShellProps}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const planOpenedCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/plan-opened"));
    expect(planOpenedCalls).toHaveLength(0);
  });

  it("shows test_set per-test catalog comment from snapshot (B7 FIX)", () => {
    // Stage 0 (sortOrder=0) is inside a Collapsible (C3); open it before asserting item content.
    const testSetItem = {
      id: "33333333-3333-4333-8333-333333333333",
      stageId: "22222222-2222-4222-8222-222222222222",
      itemType: "test_set" as const,
      itemRefId: "99999999-9999-4999-8999-999999999999",
      sortOrder: 0,
      comment: null,
      localComment: null,
      settings: null,
      snapshot: {
        itemType: "test_set",
        title: "Набор А",
        tests: [{ testId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Тест один", comment: "Пейте воду" }],
      },
      completedAt: null,
      isActionable: true,
      status: "active" as const,
      groupId: null,
      createdAt: now,
      lastViewedAt: now,
      effectiveComment: null,
    };
    render(
      <PatientTreatmentProgramDetailClient
        initial={makeInstance({
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
              startedAt: null,
              goals: null,
              objectives: null,
              expectedDurationDays: null,
              expectedDurationText: null,
              groups: [],
              items: [testSetItem],
            },
          ],
        })}
        initialTestResults={[]}
        {...detailShellProps}
      />,
    );
    fireEvent.click(screen.getByText("Рекомендации"));
    expect(screen.getByText("Набор А")).toBeInTheDocument();
    expect(screen.getByText("Пейте воду")).toBeInTheDocument();
  });

  it("renders recommendation row with left image preview from snapshot media", () => {
    const recommendationItem = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      stageId: "22222222-2222-4222-8222-222222222222",
      itemType: "recommendation" as const,
      itemRefId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      sortOrder: 0,
      comment: null,
      localComment: null,
      settings: null,
      snapshot: {
        itemType: "recommendation",
        title: "Пить воду",
        bodyMd: "Пейте **не меньше** двух литров в день. Дополнительный длинный текст для проверки обрезки превью под заголовком рекомендации.",
        media: [
          { mediaUrl: "https://example.com/preview.jpg", mediaType: "image" as const, sortOrder: 0 },
        ],
      },
      completedAt: null,
      isActionable: true,
      status: "active" as const,
      groupId: null,
      createdAt: now,
      lastViewedAt: now,
      effectiveComment: null,
    };
    render(
      <PatientTreatmentProgramDetailClient
        initial={makeInstance({
          stages: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              instanceId: "11111111-1111-4111-8111-111111111111",
              sourceStageId: null,
              title: "Этап 0",
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
              items: [recommendationItem],
            },
          ],
        })}
        initialTestResults={[]}
        {...detailShellProps}
      />,
    );
    fireEvent.click(screen.getByText("Рекомендации"));
    expect(screen.getByText("Пить воду")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Пейте не меньше двух литров в день\. Дополнительный длинный текст для проверки обрезки превью под заголовком рекомендации\./,
      ),
    ).toBeInTheDocument();
    const row = screen.getByText("Пить воду").closest("li");
    expect(row).toBeTruthy();
    const img = (row as HTMLElement).querySelector("img");
    expect(img).toBeTruthy();
    expect(img).toHaveAttribute("src", "https://example.com/preview.jpg");
  });

  it("does not show removed checklist section (1.1a)", () => {
    render(
      <PatientTreatmentProgramDetailClient
        initial={makeInstance()}
        initialTestResults={[]}
        {...detailShellProps}
      />,
    );
    expect(screen.queryByText("Чек-лист на сегодня")).not.toBeInTheDocument();
  });

  it("shows plan updated label when provided (1.1a)", () => {
    render(
      <PatientTreatmentProgramDetailClient
        initial={makeInstance()}
        initialTestResults={[]}
        appDisplayTimeZone="Europe/Moscow"
        planUpdatedLabel="План обновлён 1 янв."
      />,
    );
    expect(screen.getByText("План обновлён 1 янв.")).toBeInTheDocument();
  });

  it("renders template programDescription under title when provided", () => {
    render(
      <PatientTreatmentProgramDetailClient
        initial={makeInstance()}
        initialTestResults={[]}
        {...detailShellProps}
        programDescription="Описание из шаблона для пациента."
      />,
    );
    expect(screen.getByText("Описание из шаблона для пациента.")).toBeInTheDocument();
  });

  it("renders Этапы программы timeline with active row label", () => {
    render(
      <PatientTreatmentProgramDetailClient
        initial={makeInstance({
          stages: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              instanceId: "11111111-1111-4111-8111-111111111111",
              sourceStageId: null,
              title: "Рекомендации",
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
              items: [],
            },
            {
              id: "33333333-3333-4333-8333-333333333333",
              instanceId: "11111111-1111-4111-8111-111111111111",
              sourceStageId: null,
              title: "Острая фаза",
              description: null,
              sortOrder: 1,
              localComment: null,
              skipReason: null,
              status: "in_progress",
              startedAt: now,
              goals: null,
              objectives: null,
              expectedDurationDays: 14,
              expectedDurationText: null,
              groups: [],
              items: [],
            },
            {
              id: "44444444-4444-4444-8444-444444444444",
              instanceId: "11111111-1111-4111-8111-111111111111",
              sourceStageId: null,
              title: "Восстановление",
              description: null,
              sortOrder: 2,
              localComment: null,
              skipReason: null,
              status: "locked",
              startedAt: null,
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
        {...detailShellProps}
      />,
    );
    expect(screen.getByRole("heading", { name: "Этапы программы" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Состав этапа: Острая фаза" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Состав этапа")).toBeInTheDocument();
    expect(screen.getByText("Активный этап")).toBeInTheDocument();
    const stagesSection = document.getElementById("patient-program-current-stage");
    expect(stagesSection).toBeTruthy();
    expect(within(stagesSection as HTMLElement).getByText("Острая фаза")).toBeInTheDocument();
    expect(within(stagesSection as HTMLElement).getByText("Восстановление")).toBeInTheDocument();
  });
});
