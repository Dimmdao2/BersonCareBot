import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  isInstanceStageItemActiveForPatient,
  isInstanceStageItemShownInPatientCompositionModal,
  omitDisabledInstanceStageItemsForPatientApi,
  patientStageItemShowsNewBadge,
  patientStageSectionShouldRender,
  splitPatientProgramStagesForDetailUi,
  selectCurrentWorkingStageForPatientDetail,
  expectedStageControlDateIso,
  patientTreatmentProgramStageScreenVariant,
  countBlockingStagesBeforePatientStage,
  latestCompletedAtIsoAmongStageItems,
  calendarDaysFromUtcIsoToNowInZone,
  formatRelativePatientCalendarDayRu,
} from "./stage-semantics";
import type { TreatmentProgramInstanceDetail } from "./types";

function minimalDetail(
  items: Array<{ id: string; status: "active" | "disabled" }>,
): TreatmentProgramInstanceDetail {
  const baseItem = {
    stageId: "stage-1",
    itemType: "recommendation" as const,
    itemRefId: "11111111-1111-4111-8111-111111111111",
    sortOrder: 0,
    comment: null,
    localComment: null,
    settings: null,
    snapshot: {},
    completedAt: null,
    isActionable: true as boolean | null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastViewedAt: "2026-01-01T00:00:00.000Z" as string | null,
  };
  return {
    id: "inst-1",
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId: null,
    assignedBy: null,
    title: "T",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    patientPlanLastOpenedAt: null as string | null,
    stages: [
      {
        id: "stage-1",
        instanceId: "inst-1",
        sourceStageId: null,
        title: "S",
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
        items: items.map((it) => ({
          ...baseItem,
          id: it.id,
          status: it.status,
          groupId: null as string | null,
          effectiveComment: null,
        })),
        groups: [],
      },
    ],
  };
}

describe("stage-semantics (A2 patient read model)", () => {
  it("isInstanceStageItemActiveForPatient excludes disabled", () => {
    expect(
      isInstanceStageItemActiveForPatient({
        itemType: "lesson",
        isActionable: null,
        status: "active",
      }),
    ).toBe(true);
    expect(
      isInstanceStageItemActiveForPatient({
        itemType: "lesson",
        isActionable: null,
        status: "disabled",
      }),
    ).toBe(false);
  });

  it("omitDisabledInstanceStageItemsForPatientApi drops disabled rows from stages[].items", () => {
    const detail = minimalDetail([
      { id: "a", status: "active" },
      { id: "b", status: "disabled" },
    ]);
    const out = omitDisabledInstanceStageItemsForPatientApi(detail);
    expect(out.stages[0]!.items).toHaveLength(1);
    expect(out.stages[0]!.items[0]!.id).toBe("a");
  });

  it("omitDisabledInstanceStageItemsForPatientApi drops groups that only had disabled items", () => {
    const detail = minimalDetail([{ id: "a", status: "disabled" }]);
    const st = detail.stages[0]!;
    st.groups = [
      {
        id: "g1",
        stageId: st.id,
        sourceGroupId: null,
        title: "G",
        description: null,
        scheduleText: null,
        sortOrder: 0,
      },
    ];
    st.items[0]!.groupId = "g1";
    const out = omitDisabledInstanceStageItemsForPatientApi(detail);
    expect(out.stages[0]!.items).toHaveLength(0);
    expect(out.stages[0]!.groups).toHaveLength(0);
  });
});

describe("patientStageSectionShouldRender", () => {
  it("renders when there is at least one visible item", () => {
    expect(
      patientStageSectionShouldRender(
        {
          status: "available",
          items: [
            { itemType: "lesson", isActionable: null, status: "active" },
            { itemType: "lesson", isActionable: null, status: "disabled" },
          ],
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
        },
        false,
      ),
    ).toBe(true);
  });

  it("does not render when no visible items and stage not blocked", () => {
    expect(
      patientStageSectionShouldRender(
        {
          status: "available",
          items: [{ itemType: "lesson", isActionable: null, status: "disabled" }],
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
        },
        false,
      ),
    ).toBe(false);
  });

  it("renders when content blocked (locked) and no visible items — «этап откроется»", () => {
    expect(
      patientStageSectionShouldRender(
        {
          status: "locked",
          items: [{ itemType: "lesson", isActionable: null, status: "disabled" }],
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
        },
        false,
      ),
    ).toBe(true);
  });

  it("does not render empty locked stage when ignoreStageLockForContent (этап 0)", () => {
    expect(
      patientStageSectionShouldRender(
        {
          status: "locked",
          items: [{ itemType: "lesson", isActionable: null, status: "disabled" }],
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
        },
        true,
      ),
    ).toBe(false);
  });

  it("renders when A1 header fields set but no items", () => {
    expect(
      patientStageSectionShouldRender(
        {
          status: "available",
          items: [],
          goals: "Цель",
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
        },
        false,
      ),
    ).toBe(true);
  });

  it("does not count test_set as a program-surface item (tests only on testing page)", () => {
    expect(
      patientStageSectionShouldRender(
        {
          status: "available",
          items: [{ itemType: "test_set", isActionable: true, status: "active" }],
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
        },
        false,
      ),
    ).toBe(false);
  });

  it("excludes test_set from composition modal item list", () => {
    expect(
      isInstanceStageItemShownInPatientCompositionModal({
        itemType: "test_set",
        status: "active",
        isActionable: true,
      }),
    ).toBe(false);
  });

  it("includes lfk_complex in composition modal when active", () => {
    expect(
      isInstanceStageItemShownInPatientCompositionModal({
        itemType: "lfk_complex",
        status: "active",
        isActionable: true,
      }),
    ).toBe(true);
  });
});

describe("stage-semantics (A5 new badge)", () => {
  it("patientStageItemShowsNewBadge is false when stage content blocked", () => {
    expect(
      patientStageItemShowsNewBadge(
        { itemType: "lesson", isActionable: null, status: "active", lastViewedAt: null },
        true,
      ),
    ).toBe(false);
  });

  it("patientStageItemShowsNewBadge when active and lastViewedAt null", () => {
    expect(
      patientStageItemShowsNewBadge(
        { itemType: "lesson", isActionable: null, status: "active", lastViewedAt: null },
        false,
      ),
    ).toBe(true);
  });

  it("patientStageItemShowsNewBadge hides for disabled", () => {
    expect(
      patientStageItemShowsNewBadge(
        { itemType: "lesson", isActionable: null, status: "disabled", lastViewedAt: null },
        false,
      ),
    ).toBe(false);
  });
});

describe("stage-semantics (1.1a detail split)", () => {
  const mk = (
    id: string,
    sortOrder: number,
    status: "locked" | "available" | "in_progress" | "completed" | "skipped",
  ): TreatmentProgramInstanceDetail["stages"][number] => ({
    id,
    instanceId: "inst",
    sourceStageId: null,
    title: `S${sortOrder}`,
    description: null,
    sortOrder,
    localComment: null,
    skipReason: null,
    status,
    startedAt: null as string | null,
    goals: null,
    objectives: null,
    expectedDurationDays: null,
    expectedDurationText: null,
    groups: [],
    items: [
      {
        id: `${id}-item`,
        stageId: id,
        itemType: "recommendation" as const,
        itemRefId: "55555555-5555-4555-8555-555555555555",
        sortOrder: 0,
        comment: null,
        localComment: null,
        settings: null,
        snapshot: {},
        completedAt: null,
        isActionable: true,
        status: "active" as const,
        groupId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastViewedAt: null,
        effectiveComment: null,
      },
    ],
  });

  it("splitPatientProgramStagesForDetailUi separates zero, pipeline, archive", () => {
    const stages = [
      mk("z", 0, "available"),
      mk("a", 1, "completed"),
      mk("b", 2, "available"),
    ];
    const { stageZero, archive, pipeline } = splitPatientProgramStagesForDetailUi(stages);
    expect(stageZero.map((s) => s.id)).toEqual(["z"]);
    expect(archive.map((s) => s.id)).toEqual(["a"]);
    expect(pipeline.map((s) => s.id)).toEqual(["b"]);
  });

  it("selectCurrentWorkingStageForPatientDetail prefers in_progress over available", () => {
    const pipeline = [mk("b", 2, "available"), mk("c", 3, "in_progress")];
    expect(selectCurrentWorkingStageForPatientDetail(pipeline)?.id).toBe("c");
  });

  it("expectedStageControlDateIso returns null without both fields", () => {
    expect(expectedStageControlDateIso({ startedAt: null, expectedDurationDays: 7 })).toBeNull();
    expect(expectedStageControlDateIso({ startedAt: "2026-01-01T00:00:00.000Z", expectedDurationDays: null })).toBeNull();
  });

  it("expectedStageControlDateIso adds duration days to startedAt", () => {
    const iso = expectedStageControlDateIso({
      startedAt: "2026-01-01T00:00:00.000Z",
      expectedDurationDays: 7,
    });
    expect(iso).toMatch(/^2026-01-08T/);
  });

  it("patientTreatmentProgramStageScreenVariant: zero stage is always interactive", () => {
    expect(patientTreatmentProgramStageScreenVariant({ sortOrder: 0, status: "locked" })).toBe("interactive");
    expect(patientTreatmentProgramStageScreenVariant({ sortOrder: 0, status: "completed" })).toBe("interactive");
  });

  it("patientTreatmentProgramStageScreenVariant maps pipeline statuses", () => {
    expect(patientTreatmentProgramStageScreenVariant({ sortOrder: 1, status: "completed" })).toBe("pastReadOnly");
    expect(patientTreatmentProgramStageScreenVariant({ sortOrder: 1, status: "skipped" })).toBe("pastReadOnly");
    expect(patientTreatmentProgramStageScreenVariant({ sortOrder: 1, status: "locked" })).toBe("futureLocked");
    expect(patientTreatmentProgramStageScreenVariant({ sortOrder: 1, status: "in_progress" })).toBe("interactive");
    expect(patientTreatmentProgramStageScreenVariant({ sortOrder: 1, status: "available" })).toBe("interactive");
  });

  it("countBlockingStagesBeforePatientStage counts non-terminal predecessors", () => {
    const stages = [
      mk("a", 1, "completed"),
      mk("b", 2, "in_progress"),
      mk("c", 3, "locked"),
    ];
    expect(countBlockingStagesBeforePatientStage(stages, { id: "c", sortOrder: 3 })).toBe(1);
    expect(countBlockingStagesBeforePatientStage(stages, { id: "b", sortOrder: 2 })).toBe(0);
  });

  it("latestCompletedAtIsoAmongStageItems picks max completedAt", () => {
    const stage = {
      items: [
        { completedAt: "2026-01-02T12:00:00.000Z" as string | null },
        { completedAt: "2026-01-05T08:00:00.000Z" as string | null },
      ],
    };
    expect(latestCompletedAtIsoAmongStageItems(stage)).toBe("2026-01-05T08:00:00.000Z");
  });

  it("calendarDaysFromUtcIsoToNowInZone is non-negative", () => {
    expect(calendarDaysFromUtcIsoToNowInZone("2026-01-01T00:00:00.000Z", "Europe/Moscow")).toBeGreaterThanOrEqual(0);
  });

  it("formatRelativePatientCalendarDayRu omits clock time (today / yesterday / N days ago)", () => {
    const now = DateTime.fromISO("2026-05-06T15:00:00.000+03:00");
    expect(formatRelativePatientCalendarDayRu("2026-05-06T02:00:00.000Z", "Europe/Moscow", now)).toBe("Сегодня");
    expect(formatRelativePatientCalendarDayRu("2026-05-05T12:00:00.000Z", "Europe/Moscow", now)).toBe("Вчера");
    expect(formatRelativePatientCalendarDayRu("2026-05-03T12:00:00.000Z", "Europe/Moscow", now)).toBe("3 дня назад");
    expect(formatRelativePatientCalendarDayRu("2026-04-26T12:00:00.000Z", "Europe/Moscow", now)).toBe("10 дней назад");
  });
});
