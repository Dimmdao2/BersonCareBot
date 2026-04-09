import { describe, expect, it } from "vitest";
import {
  analyzeMergePreviewModel,
  type MergePreviewDependentCounts,
  type MergePreviewPlatformUserRow,
} from "@/infra/platformUserMergePreview";

const emptyCounts = (): MergePreviewDependentCounts => ({
  patientBookings: 0,
  reminderRules: 0,
  supportConversations: 0,
  symptomTrackings: 0,
  lfkComplexes: 0,
  mediaFilesUploadedBy: 0,
  onlineIntakeRequests: 0,
});

function row(p: Partial<MergePreviewPlatformUserRow> & { id: string }): MergePreviewPlatformUserRow {
  return {
    phone_normalized: null,
    integrator_user_id: null,
    merged_into_id: null,
    display_name: "A",
    first_name: null,
    last_name: null,
    email: null,
    email_verified_at: null,
    role: "client",
    created_at: new Date("2020-01-01T00:00:00.000Z"),
    updated_at: new Date("2020-01-01T00:00:00.000Z"),
    is_blocked: false,
    is_archived: false,
    blocked_at: null,
    blocked_reason: null,
    blocked_by: null,
    ...p,
  };
}

const baseOpts = (over: Partial<Parameters<typeof analyzeMergePreviewModel>[2]>) => ({
  targetBindings: [],
  duplicateBindings: [],
  targetOauth: [],
  duplicateOauth: [],
  dependentCounts: { target: emptyCounts(), duplicate: emptyCounts() },
  activeBookingOverlapCount: 0,
  activeLfkTemplateConflictCount: 0,
  meaningfulDataScoreTarget: 0,
  meaningfulDataScoreDuplicate: 0,
  ...over,
});

describe("analyzeMergePreviewModel", () => {
  it("no scalar/channel/oauth conflicts when profiles align and no blockers", () => {
    const target = row({
      id: "00000000-0000-4000-8000-000000000001",
      phone_normalized: "+79000000000",
      display_name: "Same",
    });
    const duplicate = row({
      id: "00000000-0000-4000-8000-000000000002",
      phone_normalized: "+79000000000",
      display_name: "Same",
      created_at: new Date("2021-01-01T00:00:00.000Z"),
    });
    const m = analyzeMergePreviewModel(target, duplicate, baseOpts({}));
    expect(m.mergeAllowed).toBe(true);
    expect(m.v1MergeEngineCallable).toBe(true);
    expect(m.hardBlockers).toHaveLength(0);
    expect(m.scalarConflicts).toHaveLength(0);
    expect(m.channelConflicts).toHaveLength(0);
    expect(m.oauthConflicts).toHaveLength(0);
  });

  it("flags conflicting phones", () => {
    const target = row({ id: "00000000-0000-4000-8000-000000000001", phone_normalized: "+79000000001" });
    const duplicate = row({ id: "00000000-0000-4000-8000-000000000002", phone_normalized: "+79000000002" });
    const m = analyzeMergePreviewModel(target, duplicate, baseOpts({}));
    expect(m.scalarConflicts.some((c) => c.field === "phone_normalized")).toBe(true);
    expect(m.mergeAllowed).toBe(true);
    expect(m.v1MergeEngineCallable).toBe(false);
  });

  it("flags conflicting telegram bindings", () => {
    const target = row({ id: "00000000-0000-4000-8000-000000000001" });
    const duplicate = row({ id: "00000000-0000-4000-8000-000000000002" });
    const m = analyzeMergePreviewModel(
      target,
      duplicate,
      baseOpts({
        targetBindings: [{ channel_code: "telegram", external_id: "111", created_at: new Date() }],
        duplicateBindings: [{ channel_code: "telegram", external_id: "222", created_at: new Date() }],
      }),
    );
    expect(m.channelConflicts.some((c) => c.channelCode === "telegram")).toBe(true);
  });

  it("flags conflicting max bindings", () => {
    const target = row({ id: "00000000-0000-4000-8000-000000000001" });
    const duplicate = row({ id: "00000000-0000-4000-8000-000000000002" });
    const m = analyzeMergePreviewModel(
      target,
      duplicate,
      baseOpts({
        targetBindings: [{ channel_code: "max", external_id: "m1", created_at: new Date() }],
        duplicateBindings: [{ channel_code: "max", external_id: "m2", created_at: new Date() }],
      }),
    );
    expect(m.channelConflicts.some((c) => c.channelCode === "max")).toBe(true);
  });

  it("flags oauth conflict for same provider", () => {
    const target = row({ id: "00000000-0000-4000-8000-000000000001" });
    const duplicate = row({ id: "00000000-0000-4000-8000-000000000002" });
    const m = analyzeMergePreviewModel(
      target,
      duplicate,
      baseOpts({
        targetOauth: [{ provider: "google", provider_user_id: "ga", email: null, created_at: new Date() }],
        duplicateOauth: [{ provider: "google", provider_user_id: "gb", email: null, created_at: new Date() }],
      }),
    );
    expect(m.oauthConflicts.some((c) => c.provider === "google")).toBe(true);
  });

  it("hard blocker: target is alias", () => {
    const target = row({
      id: "00000000-0000-4000-8000-000000000001",
      merged_into_id: "00000000-0000-4000-8000-000000000099",
    });
    const duplicate = row({ id: "00000000-0000-4000-8000-000000000002" });
    const m = analyzeMergePreviewModel(target, duplicate, baseOpts({}));
    expect(m.hardBlockers.some((b) => b.code === "target_is_alias")).toBe(true);
    expect(m.mergeAllowed).toBe(false);
  });

  it("hard blocker: duplicate is alias", () => {
    const target = row({ id: "00000000-0000-4000-8000-000000000001" });
    const duplicate = row({
      id: "00000000-0000-4000-8000-000000000002",
      merged_into_id: "00000000-0000-4000-8000-000000000099",
    });
    const m = analyzeMergePreviewModel(target, duplicate, baseOpts({}));
    expect(m.hardBlockers.some((b) => b.code === "duplicate_is_alias")).toBe(true);
    expect(m.mergeAllowed).toBe(false);
  });

  it("hard blocker: active bookings overlap", () => {
    const target = row({ id: "00000000-0000-4000-8000-000000000001" });
    const duplicate = row({ id: "00000000-0000-4000-8000-000000000002" });
    const m = analyzeMergePreviewModel(
      target,
      duplicate,
      baseOpts({ activeBookingOverlapCount: 2 }),
    );
    expect(m.hardBlockers.some((b) => b.code === "active_bookings_time_overlap")).toBe(true);
    expect(m.mergeAllowed).toBe(false);
  });

  it("hard blocker: LFK active template conflict", () => {
    const target = row({ id: "00000000-0000-4000-8000-000000000001" });
    const duplicate = row({ id: "00000000-0000-4000-8000-000000000002" });
    const m = analyzeMergePreviewModel(
      target,
      duplicate,
      baseOpts({ activeLfkTemplateConflictCount: 1 }),
    );
    expect(m.hardBlockers.some((b) => b.code === "active_lfk_template_conflict")).toBe(true);
    expect(m.mergeAllowed).toBe(false);
  });

  it("hard blocker: different non-null integrator_user_id", () => {
    const target = row({
      id: "00000000-0000-4000-8000-000000000001",
      integrator_user_id: "100",
    });
    const duplicate = row({
      id: "00000000-0000-4000-8000-000000000002",
      integrator_user_id: "200",
    });
    const m = analyzeMergePreviewModel(target, duplicate, baseOpts({}));
    expect(m.hardBlockers.some((b) => b.code === "different_non_null_integrator_user_id")).toBe(true);
    expect(m.mergeAllowed).toBe(false);
    expect(m.v1MergeEngineCallable).toBe(false);
  });

  it("hard blocker: shared phone with meaningful data on both (shared-phone guard)", () => {
    const target = row({
      id: "00000000-0000-4000-8000-000000000001",
      phone_normalized: "+79000000000",
    });
    const duplicate = row({
      id: "00000000-0000-4000-8000-000000000002",
      phone_normalized: "+79000000000",
    });
    const m = analyzeMergePreviewModel(
      target,
      duplicate,
      baseOpts({ meaningfulDataScoreTarget: 3, meaningfulDataScoreDuplicate: 1 }),
    );
    expect(m.hardBlockers.some((b) => b.code === "shared_phone_both_have_meaningful_data")).toBe(true);
    expect(m.mergeAllowed).toBe(false);
  });
});
