/**
 * Приёмочный тест из design D-i, шаги 2–6 — прогон БЕЗ участия человека.
 *
 * Сценарий сквозной: почтовый провайдер отбил отправку по исчерпанной квоте (шаг 1 доказан
 * на настоящем SMTP-диалоге в `apps/integrator/src/integrations/email/mailer.providerQuota.test.ts`),
 * доставка встала, подтверждений больше нет, пульс перестал приходить.
 *
 * Классификаторы здесь НЕ мокаются: это ровно те функции, которые зовут пятиминутный
 * critical-tick и суточная сводка.
 */
import { describe, expect, it } from "vitest";
import {
  classifyCriticalHealthSignals,
  classifyOperatorHealthBannerSignals,
  type CriticalHealthSignalsInput,
} from "./criticalHealthSignals";
import { buildOperatorHealthDigest } from "./buildOperatorHealthDigest";
import { classifyOperatorHeartbeat } from "./heartbeat";
import type { IntegratorPushOutboxHealthSnapshot, OperatorIncidentOpenRow } from "./ports";
import {
  EMPTY_EMPTY_AUDIENCE_COUNTER,
  classifyEmptyAudienceSignal,
  mergeEmptyAudienceCounter,
} from "@/modules/operator-alerts/emptyAudience";
import { mergeOperatorHealthAlertConfigFromLegacy } from "@/modules/operator-alerts/operatorHealthAlertConfig";

const NOW = Date.parse("2026-07-26T12:00:00.000Z");

const HEALTHY_PUSH_OUTBOX: IntegratorPushOutboxHealthSnapshot = {
  dueBacklog: 0,
  deadTotal: 0,
  oldestDueAgeSeconds: null,
  dueByKind: {},
  deadByKind: {},
  processingCount: 0,
  oldestProcessingAgeSeconds: null,
  lastQueueActivityAt: "2026-07-26T11:59:00.000Z",
};

/** Инцидент, который завёл integrator, классифицировав `454 … Daily message quota exceeded`. */
const QUOTA_INCIDENT: OperatorIncidentOpenRow = {
  id: "inc-quota-1",
  dedupKey: "outbound:email:provider_quota_exhausted",
  direction: "outbound_delivery_provider",
  integration: "email",
  errorClass: "provider_quota_exhausted",
  errorDetail: null,
  openedAt: "2026-07-26T11:05:00.000Z",
  lastSeenAt: "2026-07-26T11:58:00.000Z",
  occurrenceCount: 1,
  alertSentAt: null,
};

/** Пульс не приходит два часа при пятнадцатиминутном окне. */
const DEAD_PIPELINE_HEARTBEAT = classifyOperatorHeartbeat(
  { name: "pipeline_delivery", lastPingAt: "2026-07-26T10:00:00.000Z", staleAfterSec: 15 * 60 },
  NOW,
);

/** Уведомление, которому не нашлось ни одного адресата, — 8 минут назад. */
const EMPTY_AUDIENCE = classifyEmptyAudienceSignal(
  mergeEmptyAudienceCounter(
    { ...EMPTY_EMPTY_AUDIENCE_COUNTER, byTopic: {} },
    { topic: "operator_alert:outbound_provider_quota", severity: "operational", channels: ["telegram"] },
    "2026-07-26T11:52:00.000Z",
  ),
  NOW,
);

/** Состояние коробки в момент отказа: всё «зелёное», кроме доставки. */
const BROKEN_MAIL_PATH: CriticalHealthSignalsInput = {
  webappDb: "up",
  integratorApi: "ok",
  projection: { probeStatus: "ok", deadCount: 0, retriesOverThreshold: 0 },
  outgoingDelivery: { deadTotal: 0, dueBacklog: 3 },
  outboundDeliveryProvider: {
    recentIncidentCount: 1,
    openIncidentCount: 1,
    openIncidents: [QUOTA_INCIDENT],
  },
  integratorPushOutbox: HEALTHY_PUSH_OUTBOX,
  backupJobs: {},
  probeConsecutiveFailRuns: 0,
  videoTranscodeStatus: "ok",
  deliveryEvidence: {
    confirmedDeliveries: 0,
    lastConfirmedDeliveryAt: "2026-07-26T09:12:00.000Z",
    oldestUnsentAgeSeconds: 47 * 60,
  },
  heartbeats: [DEAD_PIPELINE_HEARTBEAT],
  emptyAudience: EMPTY_AUDIENCE,
};

const CANDIDATES = classifyCriticalHealthSignals(BROKEN_MAIL_PATH);
const TOPICS = CANDIDATES.map((c) => c.topic);

describe("D-i acceptance — a dead mail path with nobody watching", () => {
  it("step 1 (webapp side): the quota rejection is its own paging class, not a generic failure", () => {
    expect(TOPICS).toContain("outbound_provider_quota");
    const candidate = CANDIDATES.find((c) => c.topic === "outbound_provider_quota")!;
    expect(candidate.lines.join("\n")).toContain("квота провайдера исчерпана");
    // Одного срабатывания достаточно: порога накопления у этого класса нет.
    expect(QUOTA_INCIDENT.occurrenceCount).toBe(1);
  });

  it("step 2: an absence alert fires over a NON-e-mail channel", () => {
    expect(TOPICS).toContain("notification_audience_empty");
    // Канал критического блока по умолчанию — staff web push, а не почта, которая и легла.
    const channels = mergeOperatorHealthAlertConfigFromLegacy(null, null).channels.critical;
    expect(channels.web_push).toBe(true);
    expect(Object.keys(channels)).not.toContain("email");
  });

  it("step 3: the heartbeat expires and alerts independently of the provider signal", () => {
    expect(DEAD_PIPELINE_HEARTBEAT.status).toBe("absent");
    expect(TOPICS).toContain("heartbeat_absent");
    // Независимость: убираем инцидент провайдера — пульс всё равно звенит.
    const withoutProviderIncident = classifyCriticalHealthSignals({
      ...BROKEN_MAIL_PATH,
      outboundDeliveryProvider: { recentIncidentCount: 0, openIncidentCount: 0, openIncidents: [] },
    });
    expect(withoutProviderIncident.map((c) => c.topic)).toContain("heartbeat_absent");
  });

  it("step 4: the oldest-unsent-age alert fires", () => {
    expect(TOPICS).toContain("outbound_oldest_unsent");
    const candidate = CANDIDATES.find((c) => c.topic === "outbound_oldest_unsent")!;
    expect(candidate.lines.join("\n")).toContain("47 мин");
  });

  it("step 5 (partial): staff in-app banner input flips to degraded", () => {
    // Полноценный постоянный баннер «доставка мертва» — отдельный пункт D-f и не входит
    // в этот слайс; здесь доказывается лишь, что вход баннера уже видит отказ.
    expect(
      classifyOperatorHealthBannerSignals({ ...BROKEN_MAIL_PATH, operatorIncidentsOpenCount: 0 }),
    ).toBe(true);
  });

  it("step 6: the digest reports RED and carries the last confirmed delivery timestamp", () => {
    const digest = buildOperatorHealthDigest({
      auditErrorCount: 0,
      incidentsOpened: [],
      incidentsResolved: [],
      jobFailures: [],
      snapshotLines: [],
      deliveryEvidence: BROKEN_MAIL_PATH.deliveryEvidence,
      heartbeats: BROKEN_MAIL_PATH.heartbeats,
      suppressRecovery: false,
    });
    expect(digest.icon).toBe("🛑");
    expect(digest.provenGreen).toBe(false);
    expect(digest.lines.join("\n")).toContain("Последняя подтверждённая доставка: 2026-07-26T09:12:00.000Z");
    expect(digest.lines.join("\n")).toContain("Подтверждённых доставок за 24 ч: 0");
  });

  it("the same box on a healthy day raises none of these", () => {
    const healthy = classifyCriticalHealthSignals({
      ...BROKEN_MAIL_PATH,
      outgoingDelivery: { deadTotal: 0, dueBacklog: 0 },
      outboundDeliveryProvider: { recentIncidentCount: 0, openIncidentCount: 0, openIncidents: [] },
      deliveryEvidence: {
        confirmedDeliveries: 25,
        lastConfirmedDeliveryAt: "2026-07-26T11:58:00.000Z",
        oldestUnsentAgeSeconds: 12,
      },
      heartbeats: [
        classifyOperatorHeartbeat(
          { name: "pipeline_delivery", lastPingAt: "2026-07-26T11:58:00.000Z", staleAfterSec: 15 * 60 },
          NOW,
        ),
      ],
      emptyAudience: classifyEmptyAudienceSignal({ ...EMPTY_EMPTY_AUDIENCE_COUNTER, byTopic: {} }, NOW),
    });
    expect(healthy).toEqual([]);
  });
});
