import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerOperatorAlertDedupPort } from "./operatorAlertRuntime";
import {
  resetInMemoryOperatorHealthAlertSent,
  inMemoryOperatorHealthAlertSentPort,
} from "@/infra/repos/inMemoryOperatorHealthAlertSent";

const getConfigValueMock = vi.hoisted(() => vi.fn());
const relayOutboundMock = vi.hoisted(() => vi.fn());
const getAdminIncidentStaffPushDepsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigValue: getConfigValueMock,
}));

vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayOutboundMock,
}));

vi.mock("@/modules/admin-incidents/adminIncidentStaffPushRuntime", () => ({
  getAdminIncidentStaffPushDeps: getAdminIncidentStaffPushDepsMock,
}));

vi.mock("@/modules/admin-incidents/sendAdminIncidentStaffWebPush", () => ({
  sendAdminIncidentStaffWebPush: vi.fn().mockResolvedValue(0),
}));

import { dispatchOperatorAlert } from "./dispatchOperatorAlert";

function operatorConfig(overrides?: {
  critical?: boolean;
  telegram?: boolean;
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
        critical: { telegram: overrides?.telegram ?? true, max: false, web_push: false },
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
    getAdminIncidentStaffPushDepsMock.mockReturnValue(null);
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") return operatorConfig();
      if (key === "admin_incident_alert_config") return "";
      if (key === "admin_telegram_ids") return "111,222";
      if (key === "admin_max_ids") return "";
      return "";
    });
  });

  it("skips when block disabled", async () => {
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
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") return operatorConfig();
      if (key === "admin_incident_alert_config") return "";
      if (key === "admin_telegram_ids") return "";
      if (key === "admin_max_ids") return "";
      return "";
    });
    const r1 = await dispatchOperatorAlert({
      block: "critical",
      topic: "test",
      dedupKey: "k-retry",
      lines: ["line"],
    });
    expect(r1.reason).toBe("no_recipients");

    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") return operatorConfig();
      if (key === "admin_incident_alert_config") return "";
      if (key === "admin_telegram_ids") return "111";
      if (key === "admin_max_ids") return "";
      return "";
    });
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
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") return operatorConfig();
      if (key === "admin_incident_alert_config") return "";
      if (key === "admin_telegram_ids") return "";
      if (key === "admin_max_ids") return "";
      return "";
    });
    const r = await dispatchOperatorAlert({
      block: "critical",
      topic: "test",
      dedupKey: "k3",
      lines: ["line"],
    });
    expect(r.dispatched).toBe(false);
    expect(r.reason).toBe("no_recipients");
  });
});
