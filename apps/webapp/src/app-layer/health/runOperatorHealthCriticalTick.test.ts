import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerOperatorAlertDedupPort } from "@/modules/operator-alerts/operatorAlertRuntime";
import {
  inMemoryOperatorHealthAlertSentPort,
  resetInMemoryOperatorHealthAlertSent,
} from "@/infra/repos/inMemoryOperatorHealthAlertSent";
import {
  inMemoryOperatorHealthWritePort,
  resetInMemoryCriticalAlertIncidents,
} from "@/infra/repos/inMemoryOperatorHealthWrite";
import { dispatchOperatorAlert } from "@/modules/operator-alerts/dispatchOperatorAlert";

const collectMock = vi.hoisted(() => vi.fn());
const getConfigValueMock = vi.hoisted(() => vi.fn());
const relayOutboundMock = vi.hoisted(() => vi.fn());
const claimMock = vi.hoisted(() => vi.fn());
const completeMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn());
const openOrTouchMock = vi.hoisted(() => vi.fn());
const claimIncidentAlertIfDueMock = vi.hoisted(() => vi.fn());
const resolveStaleMock = vi.hoisted(() => vi.fn());
const loadAdminNotificationTargetsMock = vi.hoisted(() => vi.fn());

vi.mock("./collectCriticalHealthSignals", () => ({
  collectCriticalHealthSignals: collectMock,
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigValue: getConfigValueMock,
}));

// C-4 (2026-07-26, commit 5f81febc4): recipients no longer come from the
// `admin_telegram_ids`/`admin_max_ids` config keys — they are resolved from whoever actually
// holds the admin role, through this registered port. Same fake-port shape as
// `dispatchOperatorAlert.test.ts` uses for the same module.
vi.mock("@/modules/operator-alerts/adminNotificationTargetsRuntime", () => ({
  getAdminNotificationTargetsPort: () => ({ loadTargets: loadAdminNotificationTargetsMock }),
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
      openOrTouchCriticalAlertIncident: openOrTouchMock,
      claimIncidentAlertIfDue: claimIncidentAlertIfDueMock,
      resolveStaleCriticalAlertIncidents: resolveStaleMock,
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

const BASE_SIGNALS = {
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

/** Stubs `probeWebappDb`'s downstream signal: `webappDb: "down"` continuously held, or cleared. */
function collectWithWebappDb(status: "down" | "up") {
  collectMock.mockResolvedValue({ ...BASE_SIGNALS, webappDb: status });
}

describe("runOperatorHealthCriticalTick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInMemoryOperatorHealthAlertSent();
    resetInMemoryCriticalAlertIncidents();
    registerOperatorAlertDedupPort(inMemoryOperatorHealthAlertSentPort);
    relayOutboundMock.mockResolvedValue({ ok: true });
    claimMock.mockResolvedValue(null);
    // #1038: the generic cadence path is real in-memory state (not a dumb stub) so the
    // proof tests below exercise the actual escalation algorithm, not a hand-rolled double.
    completeMock.mockImplementation((input: Parameters<typeof inMemoryOperatorHealthWritePort.completeOutboundProviderAlertClaim>[0]) =>
      inMemoryOperatorHealthWritePort.completeOutboundProviderAlertClaim(input),
    );
    releaseMock.mockImplementation((input: Parameters<typeof inMemoryOperatorHealthWritePort.releaseOutboundProviderAlertClaim>[0]) =>
      inMemoryOperatorHealthWritePort.releaseOutboundProviderAlertClaim(input),
    );
    openOrTouchMock.mockImplementation((input: Parameters<typeof inMemoryOperatorHealthWritePort.openOrTouchCriticalAlertIncident>[0]) =>
      inMemoryOperatorHealthWritePort.openOrTouchCriticalAlertIncident(input),
    );
    claimIncidentAlertIfDueMock.mockImplementation((input: Parameters<typeof inMemoryOperatorHealthWritePort.claimIncidentAlertIfDue>[0]) =>
      inMemoryOperatorHealthWritePort.claimIncidentAlertIfDue(input),
    );
    resolveStaleMock.mockImplementation((input: Parameters<typeof inMemoryOperatorHealthWritePort.resolveStaleCriticalAlertIncidents>[0]) =>
      inMemoryOperatorHealthWritePort.resolveStaleCriticalAlertIncidents(input),
    );
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") return operatorConfigJson();
      if (key === "admin_incident_alert_config") return "";
      return "";
    });
    // C-4: fixed fake recipient — whoever currently holds the admin role, resolved through the
    // registered port (not config keys anymore, see the module mock above).
    loadAdminNotificationTargetsMock.mockResolvedValue({ telegram: ["4242"], max: [], sms: [], email: [] });
    collectWithWebappDb("down");
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

  // #1038 proof block: DEDUP_HOURS=24 on a flat per-topic key silently swallowed every
  // repeat for a day for every critical topic except outbound_delivery_provider /
  // integrator_push_outbox. These four tests are the required proof — a held fault, not a
  // green-suite inference — that the generic escalating cadence now covers the rest
  // (webapp_db down, tenant isolation, dead heartbeats, ...), matches taskdb #950's cadence
  // (immediately -> +1h -> daily-digest-only), still refuses to page every 5-minute tick, and
  // stops shouting once the fault actually clears. Nothing here ever calls a real send: relay
  // is mocked at the HTTP boundary (`relayOperatorAlert`) and every assertion below is on the
  // resolved dispatch decision (`alerted`/`keys`) and the recipient set passed to that mock,
  // never on an actual delivery.
  describe("escalation cadence (#1038)", () => {
    it("PROOF 1 — reproduces the pre-fix silence: dispatchOperatorAlert's own flat 24h dedup swallows an immediate repeat for a critical topic", async () => {
      // This is the exact mechanism named in the audit (dispatchOperatorAlert.ts:20,133-139).
      // It is unchanged by the fix — the critical tick simply no longer routes generic
      // critical topics through it (see the new `deduplication: "incident_cadence"` calls in
      // runOperatorHealthCriticalTick.ts). Calling it directly, the way the OLD default path
      // did for every critical topic, still reproduces the original bug on its own.
      const first = await dispatchOperatorAlert({
        block: "critical",
        topic: "webapp_db",
        dedupKey: "critical:webapp_db:down",
        lines: ["БД webapp: недоступна"],
        pushTitle: "Критичный сбой: БД webapp",
        pushUrl: "/app/admin/system-health",
      });
      const second = await dispatchOperatorAlert({
        block: "critical",
        topic: "webapp_db",
        dedupKey: "critical:webapp_db:down",
        lines: ["БД webapp: недоступна"],
        pushTitle: "Критичный сбой: БД webapp",
        pushUrl: "/app/admin/system-health",
      });
      expect(first.dispatched).toBe(true);
      expect(second).toEqual({ dispatched: false, reason: "dedup" });
    });

    it("PROOF 2 — held fault escalates at T0 and again at exactly +1h (owner cadence #950), via the generic incident-cadence path", async () => {
      collectWithWebappDb("down");
      const t0 = await runOperatorHealthCriticalTick(new Date("2026-07-27T06:00:00.000Z"));
      expect(t0.alerted).toBe(1);
      expect(t0.keys).toEqual(["critical:webapp_db:down"]);

      const before1h = await runOperatorHealthCriticalTick(new Date("2026-07-27T06:59:59.000Z"));
      expect(before1h.alerted).toBe(0);

      const at1h = await runOperatorHealthCriticalTick(new Date("2026-07-27T07:00:00.000Z"));
      expect(at1h.alerted).toBe(1);
      expect(at1h.keys).toEqual(["critical:webapp_db:down"]);

      // Recipient set actually used — asserted, never sent for real (relay is mocked).
      const recipients = relayOutboundMock.mock.calls.map(([value]) => (value as { recipient: string }).recipient);
      expect(recipients.every((r) => r === "4242")).toBe(true);
    });

    it("PROOF 3 — a continuously held fault does not page on every 5-minute tick, before OR after the +1h escalation", async () => {
      collectWithWebappDb("down");
      const ticksIso = [
        "2026-07-27T06:00:00.000Z", // T0 -> alerts
        "2026-07-27T06:05:00.000Z",
        "2026-07-27T06:10:00.000Z",
        "2026-07-27T06:55:00.000Z",
        "2026-07-27T07:00:00.000Z", // +1h -> alerts
        "2026-07-27T07:05:00.000Z",
        "2026-07-27T09:00:00.000Z", // well before 24h, still same day: silent (digest-only from here)
      ];
      const alertedByTick: number[] = [];
      for (const iso of ticksIso) {
        const r = await runOperatorHealthCriticalTick(new Date(iso));
        alertedByTick.push(r.alerted);
      }
      expect(alertedByTick).toEqual([1, 0, 0, 0, 1, 0, 0]);
      // Exactly two real dispatch attempts across seven ticks of a held fault, not seven.
      expect(relayOutboundMock).toHaveBeenCalledTimes(2);
    });

    it("PROOF 4 — resolution stops the escalation, and does not keep shouting once healthy", async () => {
      collectWithWebappDb("down");
      await runOperatorHealthCriticalTick(new Date("2026-07-27T06:00:00.000Z")); // T0
      await runOperatorHealthCriticalTick(new Date("2026-07-27T07:00:00.000Z")); // +1h
      relayOutboundMock.mockClear();

      collectWithWebappDb("up"); // fault cleared
      const resolvedTick = await runOperatorHealthCriticalTick(new Date("2026-07-27T07:05:00.000Z"));
      expect(resolvedTick.alerted).toBe(0);
      expect(relayOutboundMock).not.toHaveBeenCalled();

      const stillHealthy = await runOperatorHealthCriticalTick(new Date("2026-07-27T09:00:00.000Z"));
      expect(stillHealthy.alerted).toBe(0);
      expect(relayOutboundMock).not.toHaveBeenCalled();

      // Bonus (not strictly required, but this is what "resolved" has to mean): a LATER,
      // genuinely new occurrence of the same dedup key pages again immediately at T0 — it is
      // not silently swallowed forever behind an incident row that never resolved.
      collectWithWebappDb("down");
      const recurred = await runOperatorHealthCriticalTick(new Date("2026-07-27T10:00:00.000Z"));
      expect(recurred.alerted).toBe(1);
      expect(recurred.keys).toEqual(["critical:webapp_db:down"]);
    });
  });
});
