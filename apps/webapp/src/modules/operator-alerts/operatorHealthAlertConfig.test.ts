import { describe, expect, it } from "vitest";
import {
  defaultOperatorHealthAlertConfig,
  isOperatorAlertBlockEnabled,
  mergeOperatorHealthAlertConfigFromLegacy,
  normalizeOperatorHealthAlertConfigForAdminPatch,
  OPERATOR_ALERT_BLOCKS,
  parseOperatorHealthAlertConfig,
  adminIncidentTopicToAlertBlock,
} from "./operatorHealthAlertConfig";

describe("operatorHealthAlertConfig", () => {
  it("defaults digestTime to 09:00", () => {
    expect(defaultOperatorHealthAlertConfig().digestTime).toBe("09:00");
    expect(defaultOperatorHealthAlertConfig().channels.critical.sms).toBe(true);
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
            critical: { telegram: true, max: false, web_push: false, sms: false },
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
    expect(cfg.channels.critical.sms).toBe(false);
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

  describe("support block (D-2, night plan 2026-07-26)", () => {
    it("is included in OPERATOR_ALERT_BLOCKS and enabled with all channels by default", () => {
      expect(OPERATOR_ALERT_BLOCKS).toContain("support");
      const cfg = defaultOperatorHealthAlertConfig();
      expect(cfg.topics.support_enabled).toBe(true);
      expect(isOperatorAlertBlockEnabled(cfg, "support")).toBe(true);
      expect(cfg.channels.support).toEqual({ telegram: true, max: true, web_push: true, sms: true });
    });

    it("parses a stored support_enabled=false and per-channel toggles", () => {
      const cfg = parseOperatorHealthAlertConfig({
        value: {
          topics: { support_enabled: false },
          channels: { support: { telegram: false, sms: true } },
        },
      });
      expect(cfg.topics.support_enabled).toBe(false);
      expect(isOperatorAlertBlockEnabled(cfg, "support")).toBe(false);
      expect(cfg.channels.support.telegram).toBe(false);
      expect(cfg.channels.support.sms).toBe(true);
      // Untouched channel keys keep the default rather than being zeroed out.
      expect(cfg.channels.support.max).toBe(true);
    });

    it("legacy-only config (no operator_health_alert_config yet) still defaults support to enabled", () => {
      const cfg = mergeOperatorHealthAlertConfigFromLegacy(null, null);
      expect(cfg.topics.support_enabled).toBe(true);
      expect(cfg.channels.support).toEqual({ telegram: true, max: true, web_push: true, sms: true });
    });

    it("normalizeOperatorHealthAlertConfigForAdminPatch accepts support_enabled and support channels", () => {
      const r = normalizeOperatorHealthAlertConfigForAdminPatch({
        topics: { critical_enabled: true, digest_enabled: true, account_conflicts: true, support_enabled: false },
        channels: {
          ...defaultOperatorHealthAlertConfig().channels,
          support: { telegram: false, max: false, web_push: false, sms: false },
        },
        digestTime: "09:00",
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.topics.support_enabled).toBe(false);
        expect(r.value.channels.support).toEqual({ telegram: false, max: false, web_push: false, sms: false });
      }
    });
  });
});
