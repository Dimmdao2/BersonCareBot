import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerOperatorAlertDedupPort } from "./operatorAlertRuntime";
import {
  resetInMemoryOperatorHealthAlertSent,
  inMemoryOperatorHealthAlertSentPort,
} from "@/infra/repos/inMemoryOperatorHealthAlertSent";

const getConfigValueMock = vi.hoisted(() => vi.fn());
const loadAdminNotificationTargetsFromDbMock = vi.hoisted(() => vi.fn());
const relayOutboundMock = vi.hoisted(() => vi.fn());
const getAdminIncidentStaffPushDepsMock = vi.hoisted(() => vi.fn());
const sendAdminIncidentStaffWebPushMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigValue: getConfigValueMock,
}));

// C-4 (2026-07-26): recipients now come from platform_users role, not from the
// admin_telegram_ids/admin_max_ids/admin_phones DB-resident lists — see pgAdminNotificationTargets.ts,
// wired to the domain layer via the registered port (adminNotificationTargetsRuntime.ts) so this
// module never imports infra/repos directly.
vi.mock("./adminNotificationTargetsRuntime", () => ({
  getAdminNotificationTargetsPort: () => ({ loadTargets: loadAdminNotificationTargetsFromDbMock }),
}));

vi.mock("./relayOperatorAlert", () => ({
  relayOperatorAlert: relayOutboundMock,
}));

vi.mock("@/modules/admin-incidents/adminIncidentStaffPushRuntime", () => ({
  getAdminIncidentStaffPushDeps: getAdminIncidentStaffPushDepsMock,
}));

vi.mock("@/modules/admin-incidents/sendAdminIncidentStaffWebPush", () => ({
  sendAdminIncidentStaffWebPush: sendAdminIncidentStaffWebPushMock,
}));

import { dispatchOperatorAlert } from "./dispatchOperatorAlert";

function operatorConfig(overrides?: {
  critical?: boolean;
  telegram?: boolean;
  email?: boolean;
  accountConflicts?: boolean;
}) {
  return JSON.stringify({
    value: {
      topics: {
        critical_enabled: overrides?.critical ?? true,
        digest_enabled: true,
        account_conflicts: overrides?.accountConflicts ?? true,
      },
      digestTime: "09:00",
      channels: {
        critical: { telegram: overrides?.telegram ?? true, max: false, web_push: false, email: overrides?.email ?? true },
        digest: { telegram: true, max: false, web_push: false },
        account_conflicts: { telegram: true, max: false, web_push: false },
      },
    },
  });
}

describe("dispatchOperatorAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInMemoryOperatorHealthAlertSent();
    registerOperatorAlertDedupPort(inMemoryOperatorHealthAlertSentPort);
    relayOutboundMock.mockResolvedValue({ ok: true });
    sendAdminIncidentStaffWebPushMock.mockResolvedValue(1);
    getAdminIncidentStaffPushDepsMock.mockReturnValue(null);
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") return operatorConfig();
      if (key === "admin_incident_alert_config") return "";
      return "";
    });
    loadAdminNotificationTargetsFromDbMock.mockResolvedValue({
      telegram: ["111", "222"],
      max: [],
      sms: [],
      email: [],
    });
  });

  it("repairs a stored attempt to disable the critical block before dispatch", async () => {
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") return operatorConfig({ critical: false });
      if (key === "admin_incident_alert_config") return "";
      return "";
    });
    const r = await dispatchOperatorAlert({
      block: "critical",
      topic: "test",
      dedupKey: "k1",
      lines: ["alert"],
    });
    expect(r.dispatched).toBe(true);
    expect(r.reason).toBeUndefined();
    expect(relayOutboundMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "telegram", recipient: "111" }),
    );
  });

  it("still skips a non-emergency account-conflicts block when disabled", async () => {
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") return operatorConfig({ accountConflicts: false });
      if (key === "admin_incident_alert_config") return "";
      return "";
    });
    const r = await dispatchOperatorAlert({
      block: "account_conflicts",
      topic: "test",
      dedupKey: "k1-account-conflicts",
      lines: ["alert"],
    });
    expect(r.dispatched).toBe(false);
    expect(r.reason).toBe("disabled");
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("dedups within 24h", async () => {
    await dispatchOperatorAlert({
      block: "critical",
      topic: "test",
      dedupKey: "same-key",
      lines: ["first"],
    });
    const r2 = await dispatchOperatorAlert({
      block: "critical",
      topic: "test",
      dedupKey: "same-key",
      lines: ["second"],
    });
    expect(r2.reason).toBe("dedup");
    expect(relayOutboundMock).toHaveBeenCalledTimes(2);
  });

  it("dispatches telegram to admin list", async () => {
    const r = await dispatchOperatorAlert({
      block: "critical",
      topic: "test",
      dedupKey: "k2",
      lines: ["line"],
    });
    expect(r.dispatched).toBe(true);
    expect(relayOutboundMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "telegram", recipient: "111" }),
    );
  });

  it("does not dedup when no recipients so a later retry can send", async () => {
    loadAdminNotificationTargetsFromDbMock.mockResolvedValue({ telegram: [], max: [], sms: [], email: [] });
    const r1 = await dispatchOperatorAlert({
      block: "critical",
      topic: "test",
      dedupKey: "k-retry",
      lines: ["line"],
    });
    expect(r1.reason).toBe("no_recipients");

    loadAdminNotificationTargetsFromDbMock.mockResolvedValue({ telegram: ["111"], max: [], sms: [], email: [] });
    const r2 = await dispatchOperatorAlert({
      block: "critical",
      topic: "test",
      dedupKey: "k-retry",
      lines: ["line"],
    });
    expect(r2.dispatched).toBe(true);
    expect(r2.reason).toBeUndefined();
  });

  it("returns no_recipients when channels on but lists empty", async () => {
    loadAdminNotificationTargetsFromDbMock.mockResolvedValue({ telegram: [], max: [], sms: [], email: [] });
    const r = await dispatchOperatorAlert({
      block: "critical",
      topic: "test",
      dedupKey: "k3",
      lines: ["line"],
    });
    expect(r.dispatched).toBe(false);
    expect(r.reason).toBe("no_recipients");
  });

  it("fans out to all five channels and isolates an email rejection", async () => {
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") {
        return JSON.stringify({
          value: {
            topics: { critical_enabled: true, digest_enabled: true, account_conflicts: true },
            digestTime: "09:00",
            channels: {
              critical: { telegram: true, max: true, web_push: true, sms: true, email: true },
              digest: { telegram: true, max: true, web_push: true, sms: true, email: true },
              account_conflicts: { telegram: true, max: true, web_push: true, sms: true, email: true },
            },
          },
        });
      }
      if (key === "admin_incident_alert_config") return "";
      return "";
    });
    loadAdminNotificationTargetsFromDbMock.mockResolvedValue({
      telegram: ["111"],
      max: ["222"],
      sms: ["+79990001122"],
      email: ["operator-email-recipient"],
    });
    getAdminIncidentStaffPushDepsMock.mockReturnValue({});
    relayOutboundMock.mockImplementation(async (input: { channel: string }) => {
      if (input.channel === "email") throw new Error("email_down");
      return { ok: true, status: "accepted" };
    });

    const result = await dispatchOperatorAlert({
      organizationId: "11111111-1111-4111-8111-111111111111",
      block: "critical",
      topic: "outbound_delivery_provider",
      dedupKey: "provider-failure",
      lines: ["🛑 ! failure"],
    });

    expect(result.dispatched).toBe(true);
    expect(relayOutboundMock).toHaveBeenCalledWith(expect.objectContaining({ channel: "telegram" }));
    expect(relayOutboundMock).toHaveBeenCalledWith(expect.objectContaining({ channel: "max" }));
    expect(relayOutboundMock).toHaveBeenCalledWith(expect.objectContaining({ channel: "sms" }));
    expect(relayOutboundMock).toHaveBeenCalledWith(expect.objectContaining({ channel: "email", recipient: "operator-email-recipient" }));
    expect(sendAdminIncidentStaffWebPushMock).toHaveBeenCalledOnce();
  });

  it("repairs a stored attempt to disable critical email and still sends it", async () => {
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") return operatorConfig({ email: false });
      if (key === "admin_incident_alert_config") return "";
      return "";
    });
    loadAdminNotificationTargetsFromDbMock.mockResolvedValue({
      telegram: ["111"], max: [], sms: [], email: ["operator-email-recipient"],
    });

    const result = await dispatchOperatorAlert({
      block: "critical",
      topic: "test",
      dedupKey: "email-disabled",
      lines: ["line"],
    });

    expect(result.dispatched).toBe(true);
    expect(relayOutboundMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "email", recipient: "operator-email-recipient" }),
    );
    expect(relayOutboundMock).toHaveBeenCalledWith(expect.objectContaining({ channel: "telegram" }));
  });

  describe("support block (D-2, night plan 2026-07-26)", () => {
    it("delivers a support submission via max when Telegram is unavailable", async () => {
      getConfigValueMock.mockImplementation(async (key: string) => {
        if (key === "operator_health_alert_config") {
          return JSON.stringify({
            value: {
              topics: { critical_enabled: true, digest_enabled: true, account_conflicts: true, support_enabled: true },
              digestTime: "09:00",
              channels: {
                support: { telegram: true, max: true, web_push: false, sms: false },
              },
            },
          });
        }
        if (key === "admin_incident_alert_config") return "";
        return "";
      });
      loadAdminNotificationTargetsFromDbMock.mockResolvedValue({
        telegram: ["111"],
        max: ["222"],
        sms: [],
        email: [],
      });
      // Telegram unreachable — exactly the scenario D-2 is designed against.
      relayOutboundMock.mockImplementation(async (input: { channel: string }) => {
        if (input.channel === "telegram") return { ok: false, reason: "no_integrator_url" };
        return { ok: true, status: "accepted" };
      });

      const result = await dispatchOperatorAlert({
        block: "support",
        topic: "support_submission_patient",
        dedupKey: "support:patient:u1:1",
        lines: ["Поддержка (webapp)", "Email: [redacted]", "", "Сообщение:", "help"],
      });

      expect(result.dispatched).toBe(true);
      expect(relayOutboundMock).toHaveBeenCalledWith(expect.objectContaining({ channel: "telegram" }));
      expect(relayOutboundMock).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "max", recipient: "222" }),
      );
    });

    it("reports no_recipients (never a silent drop) when nobody is configured on any support channel", async () => {
      getConfigValueMock.mockImplementation(async (key: string) => {
        if (key === "operator_health_alert_config") {
          return JSON.stringify({
            value: {
              topics: { support_enabled: true },
              channels: { support: { telegram: true, max: true, web_push: true, sms: true } },
            },
          });
        }
        if (key === "admin_incident_alert_config") return "";
        return "";
      });
      loadAdminNotificationTargetsFromDbMock.mockResolvedValue({ telegram: [], max: [], sms: [], email: [] });
      getAdminIncidentStaffPushDepsMock.mockReturnValue(null);

      const result = await dispatchOperatorAlert({
        block: "support",
        topic: "support_submission_guest",
        dedupKey: "support:public:2",
        lines: ["Поддержка (webapp) — гость", "Email: [redacted]"],
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe("no_recipients");
    });
  });

  it("starts other channel attempts without waiting for a hanging relay", async () => {
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") {
        return JSON.stringify({ value: {
          topics: { critical_enabled: true, digest_enabled: true, account_conflicts: true },
          digestTime: "09:00",
          channels: {
            critical: { telegram: true, max: true, web_push: false, sms: true },
            digest: { telegram: false, max: false, web_push: false, sms: false },
            account_conflicts: { telegram: false, max: false, web_push: false, sms: false },
          },
        } });
      }
      if (key === "admin_incident_alert_config") return "";
      return "";
    });
    loadAdminNotificationTargetsFromDbMock.mockResolvedValue({
      telegram: ["111"],
      max: ["222"],
      sms: ["+79990001122"],
      email: [],
    });
    let releaseTelegram: ((value: { ok: false; reason: string }) => void) | undefined;
    relayOutboundMock.mockImplementation((value: { channel: string }) => {
      if (value.channel === "telegram") {
        return new Promise((resolve) => { releaseTelegram = resolve; });
      }
      return Promise.resolve({ ok: true, status: "accepted" });
    });

    const pending = dispatchOperatorAlert({ block: "critical", topic: "provider", dedupKey: "parallel", lines: ["stop"] });
    await vi.waitFor(() => {
      expect(relayOutboundMock.mock.calls.map(([value]) => (value as { channel: string }).channel)).toEqual(
        expect.arrayContaining(["telegram", "max", "sms"]),
      );
    });
    releaseTelegram?.({ ok: false, reason: "timeout" });
    await expect(pending).resolves.toMatchObject({ dispatched: true });
  });
});
