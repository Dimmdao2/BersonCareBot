import { describe, expect, it } from "vitest";
import {
  buildOperatorHealthDigest,
  MAX_OPERATOR_HEALTH_DIGEST_LINES,
  OPERATOR_HEALTH_DIGEST_LINK,
  type OperatorHealthDigestInput,
} from "./buildOperatorHealthDigest";
import type { DeliveryEvidence } from "./deliveryEvidence";
import type { OperatorHeartbeatVerdict } from "./heartbeat";

/** Позитивное доказательство доставки: есть подтверждения, очередь не застряла. */
const HEALTHY_EVIDENCE: DeliveryEvidence = {
  confirmedDeliveries: 12,
  lastConfirmedDeliveryAt: "2026-07-26T09:00:00.000Z",
  oldestUnsentAgeSeconds: 30,
};

const ALIVE_HEARTBEATS: OperatorHeartbeatVerdict[] = [
  {
    name: "pipeline_delivery",
    label: "Пульс доставки (подтверждённая отправка)",
    status: "alive",
    lastPingAt: "2026-07-26T09:00:00.000Z",
    ageSeconds: 60,
    staleAfterSec: 900,
  },
  {
    name: "digest",
    label: "Пульс суточной сводки",
    status: "alive",
    lastPingAt: "2026-07-26T09:00:00.000Z",
    ageSeconds: 60,
    staleAfterSec: 900,
  },
];

function baseInput(overrides: Partial<OperatorHealthDigestInput> = {}): OperatorHealthDigestInput {
  return {
    auditErrorCount: 0,
    incidentsOpened: [],
    incidentsResolved: [],
    jobFailures: [],
    snapshotLines: [],
    deliveryEvidence: HEALTHY_EVIDENCE,
    heartbeats: ALIVE_HEARTBEATS,
    suppressRecovery: false,
    ...overrides,
  };
}

describe("buildOperatorHealthDigest", () => {
  it("returns ✅ when window has no issues AND delivery is positively proven", () => {
    const result = buildOperatorHealthDigest(baseInput());
    expect(result.icon).toBe("✅");
    expect(result.hasIssues).toBe(false);
    expect(result.provenGreen).toBe(true);
    expect(result.lines[0]).toBe("✅ Всё в порядке");
    expect(result.lines.at(-1)).toBe(OPERATOR_HEALTH_DIGEST_LINK);
    expect(result.lines.length).toBeLessThanOrEqual(MAX_OPERATOR_HEALTH_DIGEST_LINES);
  });

  it("returns ⚠️ when audit log has errors in window", () => {
    const result = buildOperatorHealthDigest(baseInput({ auditErrorCount: 2 }));
    expect(result.icon).toBe("⚠️");
    expect(result.hasIssues).toBe(true);
    expect(result.lines.some((l) => l.includes("Ошибки в журнале админки: 2"))).toBe(true);
  });

  it("uses a red stop header while a provider incident remains open", () => {
    const result = buildOperatorHealthDigest(
      baseInput({
        snapshotLines: ["🛑 ! Исходящая доставка: отказ провайдера"],
        hasStopIssue: true,
      }),
    );
    expect(result.icon).toBe("🛑");
    expect(result.lines[0]).toBe("🛑 ! Критический сбой исходящей доставки");
  });

  it("includes recovery line when incident resolved in window", () => {
    const result = buildOperatorHealthDigest(
      baseInput({ incidentsResolved: [{ integration: "max", errorClass: "probe_outbound" }] }),
    );
    expect(result.lines.some((l) => l.includes("Восстановлено за окно:"))).toBe(true);
    expect(result.lines.some((l) => l.includes("max / probe_outbound"))).toBe(true);
  });

  it("suppresses recovery after manual resolve-all in window", () => {
    const result = buildOperatorHealthDigest(
      baseInput({
        incidentsResolved: [{ integration: "max", errorClass: "probe_outbound" }],
        suppressRecovery: true,
      }),
    );
    expect(result.lines.some((l) => l.includes("Восстановлено за окно:"))).toBe(false);
    expect(result.lines.some((l) => l.includes("max / probe_outbound"))).toBe(false);
  });

  it("includes incidents opened and job failures in window", () => {
    const result = buildOperatorHealthDigest(
      baseInput({
        incidentsOpened: [{ integration: "rubitime", errorClass: "probe_failed" }],
        jobFailures: [
          { jobFamily: "health", jobKey: "health.operator_health_critical.tick", lastFailureAt: "x" },
        ],
      }),
    );
    expect(result.lines.some((l) => l.includes("Инцидент: rubitime"))).toBe(true);
    expect(result.lines.some((l) => l.includes("health.operator_health_critical.tick"))).toBe(true);
  });

  it("truncates detail lines to the line budget", () => {
    const result = buildOperatorHealthDigest(
      baseInput({ snapshotLines: Array.from({ length: 20 }, (_, i) => `line-${i}`) }),
    );
    expect(result.lines.length).toBeLessThanOrEqual(MAX_OPERATOR_HEALTH_DIGEST_LINES);
    expect(result.lines[0]).toMatch(/^⚠️/);
    expect(result.lines.at(-1)).toBe(OPERATOR_HEALTH_DIGEST_LINK);
  });

  // --- D-d: «зелёный» обязан быть доказанным ---------------------------------------

  it("always prints the delivery evidence, including in a green digest", () => {
    const result = buildOperatorHealthDigest(baseInput());
    expect(result.lines.some((l) => l.includes("Подтверждённых доставок за 24 ч: 12"))).toBe(true);
    expect(
      result.lines.some((l) => l.includes("Последняя подтверждённая доставка: 2026-07-26T09:00:00.000Z")),
    ).toBe(true);
    expect(result.lines.some((l) => l.startsWith("Самая старая неотправленная позиция:"))).toBe(true);
  });

  it("is NOT green when the delivery snapshot could not be collected at all", () => {
    const result = buildOperatorHealthDigest(baseInput({ deliveryEvidence: undefined }));
    expect(result.icon).toBe("🛑");
    expect(result.provenGreen).toBe(false);
    expect(result.lines[0]).toBe("🛑 ! Нет подтверждений доставки");
    expect(result.lines.some((l) => l.includes("Доказательство доставки: НЕ СОБРАНО"))).toBe(true);
  });

  it("is red when nothing was confirmed and the queue is stuck (the July shape)", () => {
    const result = buildOperatorHealthDigest(
      baseInput({
        deliveryEvidence: {
          confirmedDeliveries: 0,
          lastConfirmedDeliveryAt: "2026-07-25T09:00:00.000Z",
          oldestUnsentAgeSeconds: 3 * 60 * 60,
        },
      }),
    );
    expect(result.icon).toBe("🛑");
    expect(result.provenGreen).toBe(false);
    // Именно та метка времени, ради которой пункт 6 приёмочного теста и написан.
    expect(
      result.lines.some((l) => l.includes("Последняя подтверждённая доставка: 2026-07-25T09:00:00.000Z")),
    ).toBe(true);
    expect(result.lines.some((l) => l.includes("Очередь доставки стоит"))).toBe(true);
  });

  it("is red when a heartbeat stopped arriving", () => {
    const result = buildOperatorHealthDigest(
      baseInput({
        heartbeats: [
          ALIVE_HEARTBEATS[0]!,
          {
            name: "digest",
            label: "Пульс суточной сводки",
            status: "absent",
            lastPingAt: "2026-07-24T09:00:00.000Z",
            ageSeconds: 40 * 60 * 60,
            staleAfterSec: 26 * 60 * 60,
          },
        ],
      }),
    );
    expect(result.icon).toBe("🛑");
    expect(result.provenGreen).toBe(false);
    expect(result.lines[0]).toBe("🛑 ! Пропал пульс доставки");
    expect(result.lines.some((l) => l.includes("Пропал пульс — Пульс суточной сводки"))).toBe(true);
  });

  it("a quiet day with an empty queue stays green — no traffic is not a failure", () => {
    const result = buildOperatorHealthDigest(
      baseInput({
        deliveryEvidence: {
          confirmedDeliveries: 0,
          lastConfirmedDeliveryAt: "2026-07-25T09:00:00.000Z",
          oldestUnsentAgeSeconds: null,
        },
      }),
    );
    expect(result.icon).toBe("✅");
    expect(result.provenGreen).toBe(true);
  });
});
