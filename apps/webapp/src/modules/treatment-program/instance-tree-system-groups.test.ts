import { describe, expect, it } from "vitest";
import { withDefaultSystemGroupsIfNeededForTreeStage } from "./instance-tree-system-groups";
import {
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS,
} from "./types";

const baseStage = {
  sourceStageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "S",
  description: null,
  sortOrder: 1,
  status: "available" as const,
  goals: null,
  objectives: null,
  expectedDurationDays: null,
  expectedDurationText: null,
};

describe("withDefaultSystemGroupsIfNeededForTreeStage", () => {
  it("prepends recommendations group when ungrouped recommendation and no system groups", () => {
    const out = withDefaultSystemGroupsIfNeededForTreeStage({
      ...baseStage,
      items: [
        {
          itemType: "recommendation" as const,
          itemRefId: "11111111-1111-4111-8111-111111111111",
          sortOrder: 0,
          comment: null,
          settings: null,
          snapshot: {},
        },
      ],
    });
    expect(out.groups).toHaveLength(1);
    expect(out.groups![0]).toMatchObject({
      systemKind: "recommendations",
      sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
      sourceGroupId: null,
    });
  });

  it("prepends both system groups when ungrouped rec and test_set without systems", () => {
    const out = withDefaultSystemGroupsIfNeededForTreeStage({
      ...baseStage,
      items: [
        {
          itemType: "recommendation" as const,
          itemRefId: "11111111-1111-4111-8111-111111111111",
          sortOrder: 0,
          comment: null,
          settings: null,
          snapshot: {},
        },
        {
          itemType: "test_set" as const,
          itemRefId: "22222222-2222-4222-8222-222222222222",
          sortOrder: 1,
          comment: null,
          settings: null,
          snapshot: {},
        },
      ],
    });
    expect(out.groups).toHaveLength(2);
    expect(out.groups![0]!.systemKind).toBe("recommendations");
    expect(out.groups![1]!.systemKind).toBe("tests");
    expect(out.groups![1]!.sortOrder).toBe(TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS);
  });

  it("is idempotent when system groups already present", () => {
    const stage = {
      ...baseStage,
      groups: [
        {
          sourceGroupId: null,
          title: "Рекомендации",
          description: null,
          scheduleText: null,
          sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
          systemKind: "recommendations" as const,
        },
        {
          sourceGroupId: null,
          title: "Тесты",
          description: null,
          scheduleText: null,
          sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS,
          systemKind: "tests" as const,
        },
      ],
      items: [
        {
          itemType: "recommendation" as const,
          itemRefId: "11111111-1111-4111-8111-111111111111",
          sortOrder: 0,
          comment: null,
          settings: null,
          snapshot: {},
        },
      ],
    };
    const out = withDefaultSystemGroupsIfNeededForTreeStage(stage);
    expect(out).toBe(stage);
    expect(out.groups).toHaveLength(2);
  });
});
