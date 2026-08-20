import { beforeEach, describe, expect, it } from 'vitest';
import {
  CRITICAL_ALERT_CADENCE_INTEGRATION,
  SAAS_BILLING_RECONCILE_CADENCE_INTEGRATION,
} from '@/modules/operator-health/ports';
import {
  inMemoryOperatorHealthWritePort,
  resetInMemoryCriticalAlertIncidents,
} from './inMemoryOperatorHealthWrite';

/**
 * Этап 1, пункт 1.5. `resolveStaleCriticalAlertIncidents` resolves BY ABSENCE from the caller's
 * candidate list. The five-minute health tick's candidate list never contains a reconciliation
 * discrepancy key, and the hourly reconciliation's never contains a health key — so before the
 * namespace split each sweep closed the other's open incident, the next run reopened it, and the
 * owner was paged again at T0 every hour for one unchanged fault. He forbade exactly that.
 */
describe('operator_incidents cadence namespaces do not resolve each other', () => {
  beforeEach(() => {
    resetInMemoryCriticalAlertIncidents();
  });

  it('the health tick sweep leaves an open reconciliation incident open', async () => {
    const reconcileIncident =
      await inMemoryOperatorHealthWritePort.openOrTouchCriticalAlertIncident({
        dedupKey: 'saas_billing_reconcile:invoice:in-9021',
        direction: 'saas_billing_reconcile',
        integration: SAAS_BILLING_RECONCILE_CADENCE_INTEGRATION,
        nowIso: '2026-08-18T10:00:00.000Z',
      });

    // A fully healthy five-minute tick: no critical candidates at all.
    const swept = await inMemoryOperatorHealthWritePort.resolveStaleCriticalAlertIncidents({
      integration: CRITICAL_ALERT_CADENCE_INTEGRATION,
      activeDedupKeys: [],
    });

    expect(swept).toEqual({ resolved: 0 });
    // Still the SAME row: a resolved row would have made the next open-or-touch create a new one
    // with a fresh `openedAt`, restarting the T0 escalation.
    await expect(
      inMemoryOperatorHealthWritePort.openOrTouchCriticalAlertIncident({
        dedupKey: 'saas_billing_reconcile:invoice:in-9021',
        direction: 'saas_billing_reconcile',
        integration: SAAS_BILLING_RECONCILE_CADENCE_INTEGRATION,
        nowIso: '2026-08-18T11:00:00.000Z',
      }),
    ).resolves.toEqual({ id: reconcileIncident.id, openedAt: '2026-08-18T10:00:00.000Z' });
  });

  it('each sweep still resolves its own cleared incident', async () => {
    await inMemoryOperatorHealthWritePort.openOrTouchCriticalAlertIncident({
      dedupKey: 'webapp_db_down',
      direction: 'webapp_db',
      integration: CRITICAL_ALERT_CADENCE_INTEGRATION,
      nowIso: '2026-08-18T10:00:00.000Z',
    });

    await expect(
      inMemoryOperatorHealthWritePort.resolveStaleCriticalAlertIncidents({
        integration: CRITICAL_ALERT_CADENCE_INTEGRATION,
        activeDedupKeys: [],
      }),
    ).resolves.toEqual({ resolved: 1 });
  });
});
