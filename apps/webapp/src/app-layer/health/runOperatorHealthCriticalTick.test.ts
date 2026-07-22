import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerOperatorAlertDedupPort } from "@/modules/operator-alerts/operatorAlertRuntime";
import {
  inMemoryOperatorHealthAlertSentPort,
  resetInMemoryOperatorHealthAlertSent,
} from "@/infra/repos/inMemoryOperatorHealthAlertSent";

const collectMock = vi.hoisted(() => vi.fn());
const getConfigValueMock = vi.hoisted(() => vi.fn());
const relayOutboundMock = vi.hoisted(() => vi.fn());
const claimMock = vi.hoisted(() => vi.fn());
const completeMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn());

vi.mock("./collectCriticalHealthSignals", () => ({
  collectCriticalHealthSignals: collectMock,
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigValue: getConfigValueMock,
}));

vi.mock("@/modules/operator-alerts/relayOperatorAlert", () => ({
  relayOperatorAlert: relayOutboundMock,
}));

vi.mock("@/modules/admin-incidents/adminIncidentStaffPushRuntime", () => ({
  getAdminIncidentStaffPushDeps: vi.fn().mockReturnValue(null),
}));

vi.mock("@/modules/admin-incidents/sendAdminIncidentStaffWebPush", () => ({
  sendAdminIncidentStaffWebPush: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    operatorHealthWrite: {
      claimDueOutboundProviderAlert: claimMock,
      completeOutboundProviderAlertClaim: completeMock,
      releaseOutboundProviderAlertClaim: releaseMock,
    },
  }),
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
    claimMock.mockResolvedValue(null);
    completeMock.mockResolvedValue(true);
    releaseMock.mockResolvedValue(true);
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

  it("uses distinct stable T0/+1h incident-phase delivery ids", async () => {
    const baseInput = {
      webappDb: "up" as const,
      integratorApi: "ok" as const,
      projection: { probeStatus: "ok" as const, deadCount: 0, retriesOverThreshold: 0 },
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
      videoTranscodeStatus: "ok" as const,
      webhookBursts: [],
    };
    const incident = {
      id: "11111111-1111-4111-8111-111111111111",
      dedupKey: "outbound_delivery_provider:email:provider_send_failed",
      direction: "outbound_delivery_provider",
      integration: "email",
      errorClass: "provider_send_failed",
      errorDetail: null,
      openedAt: "2026-07-22T06:00:00.000Z",
      lastSeenAt: "2026-07-22T06:00:00.000Z",
      occurrenceCount: 1,
      alertSentAt: null as string | null,
      acknowledgedAt: null,
      initialAlertSentAt: null,
      oneHourAlertSentAt: null,
    };

    collectMock.mockResolvedValue({
      ...baseInput,
      outboundDeliveryProvider: { recentIncidentCount: 1, openIncidentCount: 1, openIncidents: [incident] },
    });
    claimMock
      .mockResolvedValueOnce({ ...incident, phase: "initial", claimToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })
      .mockResolvedValueOnce({ ...incident, phase: "one_hour_repeat", claimToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })
      .mockResolvedValue(null);
    expect(await runOperatorHealthCriticalTick(new Date("2026-07-22T06:00:00.000Z"))).toMatchObject({ alerted: 1 });
    expect(await runOperatorHealthCriticalTick(new Date("2026-07-22T07:00:00.000Z"))).toMatchObject({ alerted: 1 });
    expect(await runOperatorHealthCriticalTick(new Date("2026-07-23T06:00:00.000Z"))).toMatchObject({ alerted: 0 });
    const messageIds = relayOutboundMock.mock.calls.map(([value]) => (value as { messageId: string }).messageId);
    expect(messageIds).toContain(`operator-alert:incident:${incident.id}:phase:initial:telegram:4242`);
    expect(messageIds).toContain(`operator-alert:incident:${incident.id}:phase:one_hour_repeat:telegram:4242`);
    expect(completeMock).toHaveBeenCalledTimes(2);
  });
});
