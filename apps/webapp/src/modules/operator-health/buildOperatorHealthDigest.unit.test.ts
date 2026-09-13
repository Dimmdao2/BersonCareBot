import { describe, expect, it } from 'vitest';
import { buildOperatorHealthDigest } from './buildOperatorHealthDigest';

describe('buildOperatorHealthDigest', () => {
  it('groups repeated cadence incidents instead of filling the digest with identical lines', () => {
    const repeated = {
      direction: 'outbound_oldest_unsent',
      integration: 'critical_alert_cadence',
      errorClass: 'critical',
    };

    const result = buildOperatorHealthDigest({
      auditErrorCount: 0,
      incidentsOpened: [repeated, repeated, repeated, repeated],
      incidentsResolved: [],
      jobFailures: [],
      snapshotLines: [],
      suppressRecovery: false,
      deliveryEvidence: {
        confirmedDeliveries: 1,
        lastConfirmedDeliveryAt: '2026-08-29T00:00:00.000Z',
        oldestUnsentAgeSeconds: null,
      },
    });

    // Сводка обязана свернуть четыре срабатывания в одну строку и назвать тему, тяжесть и счёт.
    // Как именно построена фраза — дело сводки, здесь не переписывается.
    const incidentLines = result.lines.filter((line) => line.startsWith('Инцидент:'));
    expect(incidentLines).toHaveLength(1);
    expect(incidentLines[0]).toContain('outbound_oldest_unsent');
    expect(incidentLines[0]).toContain('critical');
    expect(incidentLines[0]).toContain('4');
  });
});
