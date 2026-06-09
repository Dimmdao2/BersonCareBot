import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerOperatorAlertDedupPort } from "@/modules/operator-alerts/operatorAlertRuntime";
import {
  inMemoryOperatorHealthAlertSentPort,
  resetInMemoryOperatorHealthAlertSent,
} from "@/infra/repos/inMemoryOperatorHealthAlertSent";

const collectMock = vi.hoisted(() => vi.fn());
const getConfigValueMock = vi.hoisted(() => vi.fn());
const relayOutboundMock = vi.hoisted(() => vi.fn());

vi.mock("./collectCriticalHealthSignals", () => ({
  collectCriticalHealthSignals: collectMock,
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigValue: getConfigValueMock,
}));

vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayOutboundMock,
}));

vi.mock("@/modules/admin-incidents/adminIncidentStaffPushRuntime", () => ({
  getAdminIncidentStaffPushDeps: vi.fn().mockReturnValue(null),
}));

vi.mock("@/modules/admin-incidents/sendAdminIncidentStaffWebPush", () => ({
  sendAdminIncidentStaffWebPush: vi.fn().mockResolvedValue(0),
}));

import { runOperatorHealthCriticalTick } from "./runOperatorHealthCriticalTick";

function operatorConfigJson() {
  return JSON.stringify({
    value: {
      topics: { critical_enabled: true, digest_enabled: true, account_conflicts: true },
      digestTime: "09:00",
      channels: {
        critical: { telegram: true, max: false, web_push: false },
        digest: { telegram: true, max: false, web_push: false },
        account_conflicts: { telegram: true, max: false, web_push: false },
      },
    },
  });
}

describe("runOperatorHealthCriticalTick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInMemoryOperatorHealthAlertSent();
    registerOperatorAlertDedupPort(inMemoryOperatorHealthAlertSentPort);
    relayOutboundMock.mockResolvedValue({ ok: true });
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") return operatorConfigJson();
      if (key === "admin_incident_alert_config") return "";
      if (key === "admin_telegram_ids") return "4242";
      if (key === "admin_max_ids") return "";
      return "";
    });
    collectMock.mockResolvedValue({
      webappDb: "down",
      integratorApi: "ok",
      projection: { probeStatus: "ok", deadCount: 0, retriesOverThreshold: 0 },
      outgoingDelivery: { deadTotal: 0, dueBacklog: 0 },
      integratorPushOutbox: {
        dueBacklog: 0,
        deadTotal: 0,
        oldestDueAgeSeconds: null,
        dueByKind: {},
        deadByKind: {},
        processingCount: 0,
        oldestProcessingAgeSeconds: null,
        lastQueueActivityAt: null,
      },
      backupJobs: {},
      probeConsecutiveFailRuns: 0,
      videoTranscodeStatus: "ok",
      webhookBursts: [],
    });
  });

  it("dispatches critical candidates and returns keys", async () => {
    const r = await runOperatorHealthCriticalTick();
    expect(r.alerted).toBe(1);
    expect(r.keys).toEqual(["critical:webapp_db:down"]);
    expect(relayOutboundMock).toHaveBeenCalled();
  });

  it("dedups repeat tick with same dedup key", async () => {
    const first = await runOperatorHealthCriticalTick();
    const second = await runOperatorHealthCriticalTick();
    expect(first.alerted).toBe(1);
    expect(second.alerted).toBe(0);
    expect(second.keys).toEqual([]);
  });
});
