import { describe, expect, it } from "vitest";
import {
  buildDefaultManualMergeResolution,
  canSubmitManualMerge,
  getAlignedMergePreviewRequest,
  hardBlockerUi,
  resolveMergePreviewAlignment,
  uuidEqualsNormalized,
  type MergePreviewApiOk,
} from "./adminMergeAccountsLogic";
import type { ManualMergeResolution } from "@/infra/repos/manualMergeResolution";

const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function basePreview(over: Partial<MergePreviewApiOk> = {}): MergePreviewApiOk {
  const target = {
    id: T1,
    phoneNormalized: "+79000000001",
    integratorUserId: "1",
    displayName: "A",
    firstName: "a",
    lastName: "a",
    email: null,
    createdAt: new Date().toISOString(),
  };
  const duplicate = {
    id: T2,
    phoneNormalized: "+79000000001",
    integratorUserId: null,
    displayName: "B",
    firstName: "b",
    lastName: "b",
    email: null,
    createdAt: new Date().toISOString(),
  };
  return {
    ok: true,
    targetId: T1,
    duplicateId: T2,
    target,
    duplicate,
    targetBindings: [],
    duplicateBindings: [],
    dependentCounts: {
      target: {
        patientBookings: 0,
        reminderRules: 0,
        supportConversations: 0,
        symptomTrackings: 0,
        lfkComplexes: 0,
        mediaFilesUploadedBy: 0,
        onlineIntakeRequests: 0,
      },
      duplicate: {
        patientBookings: 0,
        reminderRules: 0,
        supportConversations: 0,
        symptomTrackings: 0,
        lfkComplexes: 0,
        mediaFilesUploadedBy: 0,
        onlineIntakeRequests: 0,
      },
    },
    scalarConflicts: [],
    channelConflicts: [],
    oauthConflicts: [],
    autoMergeScalars: [],
    recommendation: {
      suggestedTargetId: T1,
      suggestedDuplicateId: T2,
      basis: "pick_merge_target_heuristic",
      defaultWinnerBias: "older_created_at",
    },
    mergeAllowed: true,
    v1MergeEngineCallable: true,
    platformUserMergeV2Enabled: false,
    hardBlockers: [],
    ...over,
  };
}

describe("getAlignedMergePreviewRequest", () => {
  it("asks refetch when recommendation order differs from preview ids", () => {
    const p = basePreview({
      targetId: T2,
      duplicateId: T1,
      recommendation: { suggestedTargetId: T1, suggestedDuplicateId: T2, basis: "x", defaultWinnerBias: "x" },
    });
    const r = getAlignedMergePreviewRequest(T2, T1, p);
    expect(r.shouldRefetch).toBe(true);
    expect(r.targetId).toBe(T1);
    expect(r.duplicateId).toBe(T2);
  });

  it("does not refetch when already aligned", () => {
    const p = basePreview();
    const r = getAlignedMergePreviewRequest(T1, T2, p);
    expect(r.shouldRefetch).toBe(false);
  });
});

describe("resolveMergePreviewAlignment", () => {
  it("never refetches when alignToRecommendation is false", () => {
    const p = basePreview({
      targetId: T2,
      duplicateId: T1,
      recommendation: { suggestedTargetId: T1, suggestedDuplicateId: T2, basis: "x", defaultWinnerBias: "x" },
    });
    const r = resolveMergePreviewAlignment(false, T1, T2, p);
    expect(r.shouldRefetch).toBe(false);
    expect(r.targetId).toBe(T2);
    expect(r.duplicateId).toBe(T1);
  });

  it("delegates to heuristic when alignToRecommendation is true", () => {
    const p = basePreview({
      targetId: T2,
      duplicateId: T1,
      recommendation: { suggestedTargetId: T1, suggestedDuplicateId: T2, basis: "x", defaultWinnerBias: "x" },
    });
    const r = resolveMergePreviewAlignment(true, T1, T2, p);
    expect(r.shouldRefetch).toBe(true);
    expect(r.targetId).toBe(T1);
    expect(r.duplicateId).toBe(T2);
  });
});

describe("canSubmitManualMerge", () => {
  it("returns false when hard blockers present", () => {
    const p = basePreview({
      mergeAllowed: false,
      hardBlockers: [
        {
          code: "different_non_null_integrator_user_id",
          message: "x",
        },
      ],
    });
    const res = buildDefaultManualMergeResolution(p);
    expect(canSubmitManualMerge(p, res)).toBe(false);
  });

  it("returns false when resolution ids mismatch preview", () => {
    const p = basePreview();
    const res = buildDefaultManualMergeResolution(p);
    const bad: ManualMergeResolution = { ...res, duplicateId: T1 };
    expect(canSubmitManualMerge(p, bad)).toBe(false);
  });

  it("returns false when oauth conflict missing provider choice", () => {
    const p = basePreview({
      oauthConflicts: [
        {
          provider: "google",
          targetProviderUserId: "a",
          duplicateProviderUserId: "b",
          recommendedWinner: "target",
          reason: "x",
        },
      ],
    });
    const res = buildDefaultManualMergeResolution(p);
    const stripped: ManualMergeResolution = { ...res, oauth: {} };
    expect(canSubmitManualMerge(p, stripped)).toBe(false);
    expect(canSubmitManualMerge(p, res)).toBe(true);
  });

  it('returns false when a channel conflict still has "both"', () => {
    const p = basePreview({
      channelConflicts: [
        {
          channelCode: "telegram",
          targetExternalId: "tg-target",
          duplicateExternalId: "tg-dup",
          recommendedWinner: "target",
          reason: "x",
        },
      ],
    });
    const res = buildDefaultManualMergeResolution(p);
    const bad: ManualMergeResolution = {
      ...res,
      bindings: { ...res.bindings, telegram: "both" },
    };
    expect(canSubmitManualMerge(p, bad)).toBe(false);
    expect(canSubmitManualMerge(p, res)).toBe(true);
  });
});

describe("hardBlockerUi", () => {
  it("returns Russian copy for known integrator blocker", () => {
    const u = hardBlockerUi("different_non_null_integrator_user_id");
    expect(u.title).toContain("integrator");
    expect(u.detail.length).toBeGreaterThan(10);
  });
});

describe("uuidEqualsNormalized", () => {
  it("matches hex UUID case-insensitively", () => {
    expect(
      uuidEqualsNormalized("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    ).toBe(true);
  });
  it("rejects different ids", () => {
    expect(uuidEqualsNormalized(T1, T2)).toBe(false);
  });
});
