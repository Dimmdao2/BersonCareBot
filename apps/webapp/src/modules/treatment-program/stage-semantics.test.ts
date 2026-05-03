import { describe, expect, it } from "vitest";
import {
  isInstanceStageItemActiveForPatient,
  omitDisabledInstanceStageItemsForPatientApi,
  patientStageItemShowsNewBadge,
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
