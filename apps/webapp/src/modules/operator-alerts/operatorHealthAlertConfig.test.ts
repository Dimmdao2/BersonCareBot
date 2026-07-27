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
    expect(defaultOperatorHealthAlertConfig().channels.critical.email).toBe(true);
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

  it("repairs the emergency floor when operator_health_alert_config is already stored in violation", () => {
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
    expect(cfg.topics.critical_enabled).toBe(true);
    expect(cfg.digestTime).toBe("10:00");
    expect(cfg.channels.critical).toEqual({ telegram: true, max: true, web_push: true, sms: true, email: true });
    expect(cfg.channels.critical.email).toBe(true);
    expect(cfg.locks).toEqual({
      topics: { critical_enabled: true },
      channels: { critical: { telegram: true, max: true, web_push: true, sms: true, email: true } },
    });
  });

  it("keeps email enabled when a stored pre-email config has no email key", () => {
    const cfg = parseOperatorHealthAlertConfig({
      value: { channels: { critical: { telegram: false, max: false, web_push: false, sms: false } } },
    });
    expect(cfg.channels.critical.email).toBe(true);
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

  it("rejects an attempt to disable the emergency class with a next step", () => {
    const r = normalizeOperatorHealthAlertConfigForAdminPatch({
      topics: { ...defaultOperatorHealthAlertConfig().topics, critical_enabled: false },
      channels: defaultOperatorHealthAlertConfig().channels,
      digestTime: "09:00",
    });
    expect(r).toMatchObject({
      ok: false,
      error: "critical_alerts_must_remain_enabled",
      message: "Аварийные алерты нельзя отключить. Включите «Критичные сбои» и сохраните настройку снова.",
    });
  });

  it("rejects an attempt to disable locked emergency email with a next step", () => {
    const r = normalizeOperatorHealthAlertConfigForAdminPatch({
      topics: defaultOperatorHealthAlertConfig().topics,
      channels: {
        ...defaultOperatorHealthAlertConfig().channels,
        critical: { ...defaultOperatorHealthAlertConfig().channels.critical, email: false },
      },
      digestTime: "09:00",
    });
    expect(r).toMatchObject({
      ok: false,
      error: "critical_alert_email_must_remain_enabled",
      message: "Почта для аварийных алертов всегда включена. Включите E-mail и сохраните настройку снова.",
    });
  });

  it("rejects disabling another emergency channel because all emergency channels are locked on", () => {
    const r = normalizeOperatorHealthAlertConfigForAdminPatch({
      topics: defaultOperatorHealthAlertConfig().topics,
      channels: {
        ...defaultOperatorHealthAlertConfig().channels,
        critical: { ...defaultOperatorHealthAlertConfig().channels.critical, telegram: false },
      },
      digestTime: "09:00",
    });
    expect(r).toMatchObject({
      ok: false,
      error: "critical_alert_channels_must_remain_enabled",
      message:
        "Все доступные каналы аварийных алертов должны оставаться включёнными. Включите отключённый канал и сохраните настройку снова.",
    });
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
      expect(cfg.channels.support).toEqual({ telegram: true, max: true, web_push: true, sms: true, email: true });
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
      expect(cfg.channels.support).toEqual({ telegram: true, max: true, web_push: true, sms: true, email: true });
    });

    it("normalizeOperatorHealthAlertConfigForAdminPatch accepts support_enabled and support channels", () => {
      const r = normalizeOperatorHealthAlertConfigForAdminPatch({
        topics: { critical_enabled: true, digest_enabled: true, account_conflicts: true, support_enabled: false },
        channels: {
          ...defaultOperatorHealthAlertConfig().channels,
          support: { telegram: false, max: false, web_push: false, sms: false, email: false },
        },
        digestTime: "09:00",
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.topics.support_enabled).toBe(false);
        expect(r.value.channels.support).toEqual({ telegram: false, max: false, web_push: false, sms: false, email: false });
      }
    });
  });
});
