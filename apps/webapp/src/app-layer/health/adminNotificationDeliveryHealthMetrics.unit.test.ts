import { describe, expect, it } from 'vitest';
import { classifyNotificationDeliverySystemHealthStatus } from '@/app-layer/health/adminNotificationDeliveryHealthMetrics';
import {
  NOTIFICATION_DELIVERY_CHANNELS,
  type NotificationDeliveryChannel,
  type NotificationDeliveryChannelAggregate,
  type NotificationDeliveryHealthSnapshot,
} from '@/modules/notification-delivery/types';

/**
 * WHAT BREAKS WITHOUT THIS (systemic residual audit 2026-08-27 §C2): the attempt journal has been
 * FAILURE-ONLY since 20260826T170000, so a health card that derives "did anything get delivered"
 * from that journal can never report a healthy channel. Two concrete consequences, both invisible
 * to the operator:
 *   - a working system with real deliveries and no failures renders as «нет данных»;
 *   - a COMPLETE delivery outage renders exactly the same as a quiet day, because an outage writes
 *     no failure row either — nothing is attempted at all.
 *
 * ORACLE: the audit finding plus the canonical delivery lifecycle contract (a row that reaches
 * `sent` in `outgoing_delivery_queue` is the confirmed delivery), never this module's own code.
 */

function channels(
  overrides: Partial<Record<NotificationDeliveryChannel, Partial<NotificationDeliveryChannelAggregate>>> = {},
): NotificationDeliveryHealthSnapshot['byChannel'] {
  return Object.fromEntries(
    NOTIFICATION_DELIVERY_CHANNELS.map((ch) => [
      ch,
      {
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastErrorAt: null,
        lastProviderStatusCode: null,
        lastErrorReason: null,
        lastErrorMessage: null,
        ...(overrides[ch] ?? {}),
      },
    ]),
  ) as NotificationDeliveryHealthSnapshot['byChannel'];
}

const configured = { vapidConfigured: true, smtpConfigured: true };

describe('delivery health follows the failure-only attempt journal', () => {
  it('reports ok from confirmed queue deliveries even though the journal holds no success row', () => {
    const status = classifyNotificationDeliverySystemHealthStatus({
      // failure-only journal: nothing failed, so it is empty
      totalAttempts24h: 0,
      confirmedDeliveries24h: 12,
      dueBacklog: 0,
      byChannel: channels(),
      recentIssues: [],
      ...configured,
    });

    expect(status).toBe('ok');
  });

  it('separates a total outage from a quiet day', () => {
    const quietDay = classifyNotificationDeliverySystemHealthStatus({
      totalAttempts24h: 0,
      confirmedDeliveries24h: 0,
      dueBacklog: 0,
      byChannel: channels(),
      recentIssues: [],
      ...configured,
    });
    const totalOutage = classifyNotificationDeliverySystemHealthStatus({
      totalAttempts24h: 0,
      confirmedDeliveries24h: 0,
      // work is waiting in the canonical queue and nothing is going out — no failure row exists
      dueBacklog: 37,
      byChannel: channels(),
      recentIssues: [],
      ...configured,
    });

    expect(quietDay).toBe('no_data');
    expect(totalOutage).toBe('degraded');
  });

  it('still degrades on a real provider failure recorded in the journal', () => {
    const status = classifyNotificationDeliverySystemHealthStatus({
      totalAttempts24h: 1,
      confirmedDeliveries24h: 50,
      dueBacklog: 0,
      byChannel: channels({ email: { failedCount: 1 } }),
      recentIssues: [],
      ...configured,
    });

    expect(status).toBe('degraded');
  });

  it('never treats a success row in the attempt journal as delivery evidence', () => {
    // A stale writer (or a bad backfill) putting `status = 'success'` back into the attempt journal
    // must not be able to paint the card green on its own: only the canonical queue can.
    const status = classifyNotificationDeliverySystemHealthStatus({
      totalAttempts24h: 25,
      confirmedDeliveries24h: 0,
      dueBacklog: 4,
      byChannel: channels({ telegram: { successCount: 25, lastSuccessAt: '2026-08-27T10:00:00Z' } }),
      recentIssues: [],
      ...configured,
    });

    expect(status).toBe('degraded');
  });

  it('reports not_configured before anything else when no transport exists', () => {
    const status = classifyNotificationDeliverySystemHealthStatus({
      totalAttempts24h: 0,
      confirmedDeliveries24h: 3,
      dueBacklog: 0,
      byChannel: channels(),
      recentIssues: [],
      vapidConfigured: false,
      smtpConfigured: false,
    });

    expect(status).toBe('not_configured');
  });
});
