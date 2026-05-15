import { describe, expect, it } from "vitest";
import {
  integratorAutoMergeAnomalyDedupKey,
  parseAdminIncidentAlertConfig,
  normalizeAdminIncidentAlertConfigForAdminPatch,
} from "./adminIncidentAlertConfig";

describe("parseAdminIncidentAlertConfig", () => {
  it("defaults identity v1 topics and channels to true except system_health_db_guard", () => {
    const c = parseAdminIncidentAlertConfig(null);
    expect(c.channels.telegram).toBe(true);
    expect(c.channels.max).toBe(true);
    expect(c.topics.channel_link).toBe(true);
    expect(c.topics.messenger_phone_bind_anomaly).toBe(true);
    expect(c.topics.system_health_db_guard).toBe(false);
  });

  it("honors partial topic overrides and ignores unknown topic keys", () => {
    const c = parseAdminIncidentAlertConfig({
      value: {
        topics: { channel_link: false, extra_future: true },
        channels: { telegram: false },
      },
    });
    expect(c.topics.channel_link).toBe(false);
    expect(c.topics.auto_merge_conflict).toBe(true);
    expect(c.channels.telegram).toBe(false);
    expect(c.channels.max).toBe(true);
    expect(c.topics.system_health_db_guard).toBe(false);
  });

  it("treats broken JSON root as defaults", () => {
    const c = parseAdminIncidentAlertConfig({ value: "not-an-object" });
    expect(c.topics.channel_link).toBe(true);
  });
});

describe("integratorAutoMergeAnomalyDedupKey", () => {
  it("is stable when integratorUserIds reorder", () => {
    const a = integratorAutoMergeAnomalyDedupKey({
      eventType: "x",
      reason: "r",
      conflictClass: "c",
      integratorUserIds: ["2", "1", "2"],
    });
    const b = integratorAutoMergeAnomalyDedupKey({
      eventType: "x",
      reason: "r",
      conflictClass: "c",
      integratorUserIds: ["1", "2"],
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(48);
  });
});

describe("normalizeAdminIncidentAlertConfigForAdminPatch", () => {
  it("accepts full v1 object", () => {
    const inner = {
      topics: {
        channel_link: false,
        auto_merge_conflict: true,
        auto_merge_conflict_anomaly: true,
        messenger_phone_bind_blocked: false,
        messenger_phone_bind_anomaly: true,
        system_health_db_guard: true,
      },
      channels: { telegram: true, max: false },
    };
    const r = normalizeAdminIncidentAlertConfigForAdminPatch(inner);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.topics.channel_link).toBe(false);
      expect(r.value.topics.system_health_db_guard).toBe(true);
      expect(r.value.channels.max).toBe(false);
    }
  });

  it("strips unknown topic keys and defaults missing v1 topics to true", () => {
    const r = normalizeAdminIncidentAlertConfigForAdminPatch({
      topics: {
        channel_link: false,
        auto_merge_conflict: true,
        auto_merge_conflict_anomaly: true,
        messenger_phone_bind_blocked: true,
        extra_future: true,
      },
      channels: { telegram: true, max: true },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.topics.messenger_phone_bind_anomaly).toBe(true);
      expect(r.value.topics.channel_link).toBe(false);
      expect(r.value.topics.system_health_db_guard).toBe(false);
    }
  });

  it("defaults missing topic entries to true", () => {
    const r = normalizeAdminIncidentAlertConfigForAdminPatch({
      topics: {
        channel_link: false,
      },
      channels: { telegram: false, max: true },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.topics.channel_link).toBe(false);
      expect(r.value.topics.auto_merge_conflict).toBe(true);
      expect(r.value.topics.messenger_phone_bind_anomaly).toBe(true);
      expect(r.value.topics.system_health_db_guard).toBe(false);
    }
  });

  it("strips unknown channel keys and keeps defaults for omitted flags", () => {
    const r = normalizeAdminIncidentAlertConfigForAdminPatch({
      topics: {
        channel_link: true,
        auto_merge_conflict: true,
        auto_merge_conflict_anomaly: true,
        messenger_phone_bind_blocked: true,
        messenger_phone_bind_anomaly: true,
        system_health_db_guard: false,
      },
      channels: { telegram: false, future_flag: true },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.channels).toEqual({ telegram: false, max: true });
    }
  });

  it("rejects non-boolean for a known topic key", () => {
    const r = normalizeAdminIncidentAlertConfigForAdminPatch({
      topics: {
        channel_link: "yes",
        auto_merge_conflict: true,
        auto_merge_conflict_anomaly: true,
        messenger_phone_bind_blocked: true,
        messenger_phone_bind_anomaly: true,
        system_health_db_guard: false,
      },
      channels: { telegram: true, max: true },
    });
    expect(r.ok).toBe(false);
  });
});
