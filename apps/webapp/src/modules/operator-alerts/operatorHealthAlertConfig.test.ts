import { describe, expect, it } from "vitest";
import {
  defaultOperatorHealthAlertConfig,
  mergeOperatorHealthAlertConfigFromLegacy,
  normalizeOperatorHealthAlertConfigForAdminPatch,
  parseOperatorHealthAlertConfig,
  adminIncidentTopicToAlertBlock,
} from "./operatorHealthAlertConfig";

describe("operatorHealthAlertConfig", () => {
  it("defaults digestTime to 09:00", () => {
    expect(defaultOperatorHealthAlertConfig().digestTime).toBe("09:00");
  });

  it("merges legacy identity topics into account_conflicts", () => {
    const cfg = mergeOperatorHealthAlertConfigFromLegacy(null, {
      value: {
        topics: {
          channel_link: false,
          auto_merge_conflict: true,
          auto_merge_conflict_anomaly: false,
          messenger_phone_bind_blocked: false,
          messenger_phone_bind_anomaly: false,
          system_health_db_guard: false,
        },
        channels: { telegram: false, max: true, web_push: true },
      },
    });
    expect(cfg.topics.account_conflicts).toBe(true);
    expect(cfg.channels.account_conflicts.telegram).toBe(false);
    expect(cfg.channels.account_conflicts.max).toBe(true);
    expect(cfg.topics.critical_enabled).toBe(true);
  });

  it("prefers operator_health_alert_config when present", () => {
    const cfg = mergeOperatorHealthAlertConfigFromLegacy(
      {
        value: {
          topics: { critical_enabled: false, digest_enabled: true, account_conflicts: false },
          digestTime: "10:30",
          channels: {
            critical: { telegram: true, max: false, web_push: false },
            digest: { telegram: true, max: true, web_push: true },
            account_conflicts: { telegram: false, max: false, web_push: false },
          },
        },
      },
      { value: { topics: { channel_link: true }, channels: { telegram: true, max: true } } },
    );
    expect(cfg.topics.critical_enabled).toBe(false);
    expect(cfg.digestTime).toBe("10:00");
    expect(cfg.channels.critical.max).toBe(false);
  });

  it("parseOperatorHealthAlertConfig normalizes digestTime", () => {
    const cfg = parseOperatorHealthAlertConfig({ value: { digestTime: "9:05" } });
    expect(cfg.digestTime).toBe("09:00");
  });

  it("normalizeOperatorHealthAlertConfigForAdminPatch rejects bad digestTime", () => {
    const r = normalizeOperatorHealthAlertConfigForAdminPatch({
      topics: { critical_enabled: true, digest_enabled: true, account_conflicts: true },
      channels: defaultOperatorHealthAlertConfig().channels,
      digestTime: "25:00",
    });
    expect(r.ok).toBe(false);
  });

  it("normalizeOperatorHealthAlertConfigForAdminPatch rejects digestTime not on hour boundary", () => {
    const r = normalizeOperatorHealthAlertConfigForAdminPatch({
      topics: { critical_enabled: true, digest_enabled: true, account_conflicts: true },
      channels: defaultOperatorHealthAlertConfig().channels,
      digestTime: "09:30",
    });
    expect(r.ok).toBe(false);
  });

  it("maps legacy topics to alert blocks", () => {
    expect(adminIncidentTopicToAlertBlock("channel_link")).toBe("account_conflicts");
    expect(adminIncidentTopicToAlertBlock("system_health_db_guard")).toBe("critical");
  });
});
