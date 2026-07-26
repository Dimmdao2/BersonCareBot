import { describe, expect, it } from "vitest";
import {
  classifyEmptyAudienceSignals,
  classifyHeartbeatSignals,
  classifyOldestUnsentSignals,
  classifyProviderQuotaSignals,
} from "./criticalHealthSignals";
import type { OperatorIncidentOpenRow } from "./ports";

function incident(overrides: Partial<OperatorIncidentOpenRow>): OperatorIncidentOpenRow {
  return {
    id: "i1",
    dedupKey: "d1",
    direction: "outbound_delivery_provider",
    integration: "email",
    errorClass: "provider_send_failed",
    errorDetail: null,
    openedAt: "2026-07-26T11:00:00.000Z",
    lastSeenAt: "2026-07-26T11:00:00.000Z",
    occurrenceCount: 1,
    alertSentAt: null,
    ...overrides,
  };
}

describe("classifyProviderQuotaSignals (D-f)", () => {
  it("pages on the FIRST occurrence of a quota rejection", () => {
    const out = classifyProviderQuotaSignals([
      incident({ errorClass: "provider_quota_exhausted", occurrenceCount: 1 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.topic).toBe("outbound_provider_quota");
    expect(out[0]!.lines.join("\n")).toContain("квота провайдера исчерпана");
  });

  it("pages on credit exhaustion and on credential rejection alike", () => {
    expect(classifyProviderQuotaSignals([incident({ errorClass: "provider_credit_exhausted" })])).toHaveLength(1);
    expect(classifyProviderQuotaSignals([incident({ errorClass: "provider_auth_rejected" })])).toHaveLength(1);
  });

  it("stays out of the way for ordinary send failures", () => {
    expect(classifyProviderQuotaSignals([incident({ errorClass: "provider_send_failed" })])).toEqual([]);
  });

  it("ignores incidents from other directions and de-duplicates by class", () => {
    const out = classifyProviderQuotaSignals([
      incident({ direction: "inbound_webhook", errorClass: "provider_quota_exhausted" }),
      incident({ id: "i2", errorClass: "provider_quota_exhausted" }),
      incident({ id: "i3", errorClass: "provider_quota_exhausted" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("handles an absent incident list", () => {
    expect(classifyProviderQuotaSignals(undefined)).toEqual([]);
  });
});

describe("classifyOldestUnsentSignals (D-f)", () => {
  it("fires once the oldest unsent item passes the threshold", () => {
    const out = classifyOldestUnsentSignals({
      confirmedDeliveries: 0,
      lastConfirmedDeliveryAt: "2026-07-25T09:00:00.000Z",
      oldestUnsentAgeSeconds: 20 * 60,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.topic).toBe("outbound_oldest_unsent");
    expect(out[0]!.lines.join("\n")).toContain("2026-07-25T09:00:00.000Z");
  });

  it("is silent below the threshold and with an empty queue", () => {
    expect(
      classifyOldestUnsentSignals({
        confirmedDeliveries: 5,
        lastConfirmedDeliveryAt: "x",
        oldestUnsentAgeSeconds: 60,
      }),
    ).toEqual([]);
    expect(classifyOldestUnsentSignals(undefined)).toEqual([]);
  });
});

describe("classifyHeartbeatSignals (D-d)", () => {
  it("alerts on the ABSENCE of a ping", () => {
    const out = classifyHeartbeatSignals([
      {
        name: "pipeline_delivery",
        label: "Пульс доставки",
        status: "absent",
        lastPingAt: "2026-07-26T09:00:00.000Z",
        ageSeconds: 7200,
        staleAfterSec: 900,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.topic).toBe("heartbeat_absent");
  });

  it("alerts when a heartbeat has never arrived at all", () => {
    const out = classifyHeartbeatSignals([
      {
        name: "digest",
        label: "Пульс сводки",
        status: "never",
        lastPingAt: null,
        ageSeconds: null,
        staleAfterSec: 900,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.lines.join("\n")).toContain("пульса не было ни разу");
  });

  it("is silent while pings arrive", () => {
    expect(
      classifyHeartbeatSignals([
        {
          name: "digest",
          label: "Пульс сводки",
          status: "alive",
          lastPingAt: "2026-07-26T11:59:00.000Z",
          ageSeconds: 60,
          staleAfterSec: 900,
        },
      ]),
    ).toEqual([]);
    expect(classifyHeartbeatSignals(undefined)).toEqual([]);
  });
});

describe("classifyEmptyAudienceSignals (D-b)", () => {
  it("makes the counter itself alertable", () => {
    const out = classifyEmptyAudienceSignals({
      active: true,
      total: 4,
      lastAt: "2026-07-26T11:50:00.000Z",
      lastTopic: "notify_doctor_program_note",
      topTopics: [{ topic: "notify_doctor_program_note", count: 4 }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.topic).toBe("notification_audience_empty");
    expect(out[0]!.lines.join("\n")).toContain("notify_doctor_program_note");
  });

  it("is silent when nothing landed in the window", () => {
    expect(
      classifyEmptyAudienceSignals({ active: false, total: 9, lastAt: null, lastTopic: null, topTopics: [] }),
    ).toEqual([]);
    expect(classifyEmptyAudienceSignals(undefined)).toEqual([]);
  });
});
