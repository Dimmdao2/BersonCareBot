/** @vitest-environment jsdom */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, fireEvent, within } from "@testing-library/react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { PatientTreatmentProgramDetailClient } from "./PatientTreatmentProgramDetailClient";

const now = "2026-01-01T00:00:00.000Z";

const detailShellProps = {
  appDisplayTimeZone: "Europe/Moscow",
};

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/checklist-today")) {
      return new Response(
        JSON.stringify({
          ok: true,
          doneItemIds: [],
          doneTodayCountByActivityKey: {},
          lastDoneAtIsoByActivityKey: {},
        }),
        { status: 200 },
      );
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

  it("does not show test_set on program surfaces (only on testing page)", () => {
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
    const recommendationItem = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      stageId: "22222222-2222-4222-8222-222222222222",
      itemType: "recommendation" as const,
      itemRefId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      sortOrder: 1,
      comment: null,
      localComment: null,
      settings: null,
      snapshot: { title: "Только рекомендация в списке", bodyMd: "" },
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
              items: [testSetItem, recommendationItem],
            },
          ],
        })}
        initialTestResults={[]}
        {...detailShellProps}
      />,
    );
    fireEvent.click(screen.getByText("Рекомендации"));
    expect(screen.getByText("Только рекомендация в списке")).toBeInTheDocument();
    expect(screen.queryByText("Набор А")).not.toBeInTheDocument();
    expect(screen.queryByText("Пейте воду")).not.toBeInTheDocument();
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

  it("hero shows engagement days with green indicator when program active and not awaiting start (1.1a)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T12:00:00.000Z"));
    try {
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
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                instanceId: "11111111-1111-4111-8111-111111111111",
                sourceStageId: null,
                title: "Этап 1",
                description: null,
                sortOrder: 1,
                localComment: null,
                skipReason: null,
                status: "in_progress",
                startedAt: "2026-01-06T00:00:00.000Z",
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
      expect(screen.getByText("Вы занимаетесь 5 дней")).toBeInTheDocument();
      expect(screen.queryByText(/План обновлён/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows next control region with booking when stage is in progress but control date cannot be computed", () => {
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
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              instanceId: "11111111-1111-4111-8111-111111111111",
              sourceStageId: null,
              title: "Этап 1",
              description: null,
              sortOrder: 1,
              localComment: null,
              skipReason: null,
              status: "in_progress",
              startedAt: now,
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
    const controlRegion = screen.getByRole("region", { name: "Следующий контроль" });
    expect(within(controlRegion).getByText("Срок консультации уточняется у врача.")).toBeInTheDocument();
    expect(within(controlRegion).getByRole("link", { name: /Записаться на приём/i })).toBeInTheDocument();
  });

  it("next control region uses expectedDurationText when control date cannot be computed", () => {
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
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              instanceId: "11111111-1111-4111-8111-111111111111",
              sourceStageId: null,
              title: "Этап 1",
              description: null,
              sortOrder: 1,
              localComment: null,
              skipReason: null,
              status: "in_progress",
              startedAt: now,
              goals: null,
              objectives: null,
              expectedDurationDays: null,
              expectedDurationText: "  по согласованию с врачом  ",
              groups: [],
              items: [],
            },
          ],
        })}
        initialTestResults={[]}
        {...detailShellProps}
      />,
    );
    const controlRegion = screen.getByRole("region", { name: "Следующий контроль" });
    expect(within(controlRegion).getByText("по согласованию с врачом")).toBeInTheDocument();
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
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Острая фаза")).toBeInTheDocument();
    expect(screen.getByText("Активный этап")).toBeInTheDocument();
    const stagesSection = document.getElementById("patient-program-current-stage");
    expect(stagesSection).toBeTruthy();
    expect(within(stagesSection as HTMLElement).getByText("Острая фаза")).toBeInTheDocument();
    expect(within(stagesSection as HTMLElement).getByText("Восстановление")).toBeInTheDocument();
  });

  it("stage composition modal: groups, schedule, LFK exercises expanded, no itemType in parentheses", () => {
    const groupId = "gggggggg-gggg-4ggg-8ggg-gggggggggggg";
    const stageId = "33333333-3333-4333-8333-333333333333";
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
              id: stageId,
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
              expectedDurationDays: null,
              expectedDurationText: null,
              groups: [
                {
                  id: groupId,
                  stageId,
                  sourceGroupId: null,
                  title: "Блок утро",
                  description: null,
                  scheduleText: "  2 раза в день  ",
                  sortOrder: 0,
                },
              ],
              items: [
                {
                  id: "aaaaaaaa-1111-4111-8111-111111111111",
                  stageId,
                  itemType: "lfk_complex",
                  itemRefId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                  sortOrder: 0,
                  comment: null,
                  localComment: null,
                  settings: null,
                  snapshot: {
                    title: "Шаблон комплекса",
                    exercises: [
                      { exerciseId: "e2222222-2222-4222-8222-222222222222", title: "Второе", sortOrder: 1 },
                      {
                        exerciseId: "e1111111-1111-4111-8111-111111111111",
                        title: "Первое",
                        sortOrder: 0,
                        media: [
                          { url: "https://example.com/lfk-exercise-preview.jpg", type: "image", sortOrder: 0 },
                        ],
                      },
                    ],
                  },
                  completedAt: null,
                  isActionable: true,
                  status: "active",
                  groupId,
                  createdAt: now,
                  lastViewedAt: null,
                  effectiveComment: null,
                },
                {
                  id: "aaaaaaaa-2222-4222-8222-222222222222",
                  stageId,
                  itemType: "recommendation",
                  itemRefId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                  sortOrder: 1,
                  comment: null,
                  localComment: null,
                  settings: null,
                  snapshot: { title: "Рекомендация в блоке", bodyMd: "" },
                  completedAt: null,
                  isActionable: true,
                  status: "active",
                  groupId,
                  createdAt: now,
                  lastViewedAt: null,
                  effectiveComment: null,
                },
                {
                  id: "aaaaaaaa-3333-4333-8333-333333333333",
                  stageId,
                  itemType: "recommendation",
                  itemRefId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                  sortOrder: 0,
                  comment: null,
                  localComment: null,
                  settings: null,
                  snapshot: { title: "Вне группы пункт", bodyMd: "" },
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
        })}
        initialTestResults={[]}
        {...detailShellProps}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Состав этапа: Острая фаза" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("link", { name: /Начать занятие/i })).toBeInTheDocument();
    expect(within(dialog).getAllByText("Сегодня:")).toHaveLength(4);
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Блок утро")).toBeInTheDocument();
    expect(within(dialog).getByText("2 раза в день")).toBeInTheDocument();
    expect(within(dialog).getByText("Первое")).toBeInTheDocument();
    expect(within(dialog).getByText("Второе")).toBeInTheDocument();
    expect(within(dialog).getByText("Рекомендация в блоке")).toBeInTheDocument();
    expect(within(dialog).getByText("Вне группы пункт")).toBeInTheDocument();
    expect(within(dialog).queryByText("Без группы")).not.toBeInTheDocument();
    const dialogText = dialog.textContent ?? "";
    expect(dialogText.indexOf("Вне группы пункт")).toBeLessThan(dialogText.indexOf("Блок утро"));
    expect(within(dialog).queryByText("(lfk_complex)", { exact: false })).not.toBeInTheDocument();
    expect(within(dialog).queryByText("(recommendation)", { exact: false })).not.toBeInTheDocument();
    const firstExerciseRow = within(dialog).getByText("Первое").closest("li");
    expect(firstExerciseRow?.querySelector("img")).toBeTruthy();
    expect(firstExerciseRow?.querySelector("img")?.getAttribute("src")).toContain("lfk-exercise-preview");
    const secondExerciseRow = within(dialog).getByText("Второе").closest("li");
    expect(secondExerciseRow?.querySelector("img")).toBeFalsy();
    expect(secondExerciseRow?.querySelector("svg")).toBeTruthy();
    const recInBlockRow = within(dialog).getByText("Рекомендация в блоке").closest("li");
    expect(recInBlockRow?.querySelector("img")).toBeFalsy();
    expect(recInBlockRow?.querySelector("svg")).toBeTruthy();
  });
});
