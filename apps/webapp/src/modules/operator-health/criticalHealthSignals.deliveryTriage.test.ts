/**
 * Два поведения, за которые заплатили двумя сутками незамеченной аварии телеграма (19.08).
 *
 * 1. Инцидент, открытый ПРОБОЙ по отказу учётных данных, обязан доходить до пути «пейджить с
 *    первого появления». Проба писала `direction: 'outbound'`, а путь отбирает
 *    `'outbound_delivery_provider'` — строки не совпадали, и разбудить человека было нечем.
 * 2. Красный сигнал обязан УМЕТЬ ПОГАСНУТЬ. Порогом было `deadTotal > 0` без окна, а строка `dead`
 *    терминальна: 113 июньских строк держали баннер красным вечно, и настоящая авария в нём
 *    растворилась.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyCriticalHealthSignals,
  classifyOperatorHealthBannerSignals,
  type CriticalHealthSignalsInput,
  type OperatorHealthBannerInput,
} from './criticalHealthSignals';
import type { OperatorIncidentOpenRow } from './ports';

const healthy: CriticalHealthSignalsInput = {
  webappDb: 'up',
  integratorApi: 'ok',
  outgoingDelivery: { deadTotal: 0, deadRecent: 0, dueBacklog: 0 },
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
  videoTranscodeStatus: 'ok',
};

const healthyBanner: OperatorHealthBannerInput = { ...healthy, operatorIncidentsOpenCount: 0 };

/** Ровно та строка, которую теперь пишет проба здоровья при телеграмном `401`. */
const probeAuthIncident: OperatorIncidentOpenRow = {
  id: '11111111-1111-1111-1111-111111111111',
  dedupKey: 'outbound_delivery_provider:telegram:provider_auth_rejected',
  direction: 'outbound_delivery_provider',
  integration: 'telegram',
  errorClass: 'provider_auth_rejected',
  errorDetail: '401: Unauthorized',
  openedAt: '2026-08-19T09:05:00.000Z',
  lastSeenAt: '2026-08-19T09:05:00.000Z',
  occurrenceCount: 1,
  alertSentAt: null,
  acknowledgedAt: null,
  initialAlertSentAt: null,
  oneHourAlertSentAt: null,
};

describe('отказ провайдера, замеченный пробой', () => {
  it('дано: проба открыла инцидент по отказу учётных данных телеграма → когда классификация → тогда есть сигнал «пейджить с первого появления» с названной причиной', () => {
    const candidates = classifyCriticalHealthSignals({
      ...healthy,
      outboundDeliveryProvider: {
        recentIncidentCount: 0,
        openIncidentCount: 1,
        openIncidents: [probeAuthIncident],
      },
    });

    const paged = candidates.find((c) => c.topic === 'outbound_provider_quota');
    expect(paged).toBeDefined();
    expect(paged!.dedupKey).toBe(
      'critical:outbound_provider_quota:telegram:provider_auth_rejected',
    );
    expect(paged!.lines.join('\n')).toContain('учётные данные');
  });
});

describe('мёртвые записи очереди: авария против истории', () => {
  it('дано: 113 мёртвых записей, ни одной за окно → когда классификация → тогда ни критического сигнала, ни баннера', () => {
    const stale = { deadTotal: 113, deadRecent: 0, dueBacklog: 0 };

    expect(classifyCriticalHealthSignals({ ...healthy, outgoingDelivery: stale })).toHaveLength(0);
    expect(classifyOperatorHealthBannerSignals({ ...healthyBanner, outgoingDelivery: stale })).toBe(
      false,
    );
  });

  it('дано: те же 113 записей и ОДНА новая за окно → когда классификация → тогда критический сигнал есть и называет обе величины', () => {
    const growing = { deadTotal: 114, deadRecent: 1, dueBacklog: 0 };

    const candidates = classifyCriticalHealthSignals({
      ...healthy,
      outgoingDelivery: growing,
    });
    const stop = candidates.find((c) => c.topic === 'outbound_delivery_provider');
    expect(stop).toBeDefined();
    expect(stop!.lines.join('\n')).toContain('за последние 24 ч: 1');
    expect(stop!.lines.join('\n')).toContain('Всего за историю: 114');
    expect(
      classifyOperatorHealthBannerSignals({ ...healthyBanner, outgoingDelivery: growing }),
    ).toBe(true);
  });

  it('дано: окно не собрано (старый снимок без него) → когда классификация → тогда сигнал остаётся по историческому счётчику, а не гаснет молча', () => {
    const noWindow = { deadTotal: 113, dueBacklog: 0 };

    expect(
      classifyCriticalHealthSignals({ ...healthy, outgoingDelivery: noWindow }).some(
        (c) => c.topic === 'outbound_delivery_provider',
      ),
    ).toBe(true);
  });
});
