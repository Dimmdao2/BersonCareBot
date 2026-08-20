import { collectOperatorHealthDigestInput } from '@/app-layer/health/collectOperatorHealthDigestInput';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { buildOperatorHealthDigest } from '@/modules/operator-health/buildOperatorHealthDigest';
import {
  formatLocalYmd,
  isDigestSendSlot,
  resolveDigestWindowStartIso,
} from '@/modules/operator-health/digestSchedule';
import { prepareOperatorHealthDigestDeliveries } from '@/modules/operator-health/prepareOperatorHealthDigestDeliveries';
import {
  isOperatorAlertBlockEnabled,
  mergeOperatorHealthAlertConfigFromLegacy,
  OPERATOR_HEALTH_ALERT_CONFIG_KEY,
  type OperatorHealthAlertConfig,
} from '@/modules/operator-alerts/operatorHealthAlertConfig';
import { ADMIN_INCIDENT_ALERT_CONFIG_KEY } from '@/modules/admin-incidents/adminIncidentAlertConfig';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { getConfigValue } from '@/modules/system-settings/configAdapter';
import { pingOperatorHeartbeatBestEffort } from '@/app-layer/operator-health/pingOperatorHeartbeat';

export type RunOperatorHealthDigestTickResult = {
  sent: boolean;
  reason?: 'disabled' | 'not_slot' | 'dedup' | 'no_recipients';
  dedupKey?: string;
};

async function loadDigestConfig(): Promise<OperatorHealthAlertConfig> {
  const [operatorRaw, legacyRaw] = await Promise.all([
    getConfigValue(OPERATOR_HEALTH_ALERT_CONFIG_KEY),
    getConfigValue(ADMIN_INCIDENT_ALERT_CONFIG_KEY),
  ]);
  const parseJson = (raw: string): unknown | null => {
    const t = raw.trim();
    if (!t) return null;
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return null;
    }
  };
  return mergeOperatorHealthAlertConfigFromLegacy(parseJson(operatorRaw), parseJson(legacyRaw));
}

/**
 * Digest tick: 1×/сутки в `digestTime` materializes ready per-recipient queue intents in webapp.
 */
export async function runOperatorHealthDigestTick(
  now = new Date(),
): Promise<RunOperatorHealthDigestTickResult> {
  const cfg = await loadDigestConfig();
  if (!isOperatorAlertBlockEnabled(cfg, 'digest')) {
    return { sent: false, reason: 'disabled' };
  }

  const timeZone = await getAppDisplayTimeZone();
  if (!isDigestSendSlot(now, timeZone, cfg.digestTime)) {
    return { sent: false, reason: 'not_slot' };
  }

  const localDate = formatLocalYmd(now, timeZone);
  const dedupKey = `digest:${localDate}`;
  const delivery = buildAppDeps().operatorHealthDigestDelivery;
  const windowStartIso = resolveDigestWindowStartIso(await delivery.loadLatestSentAt(), now);
  const windowEndIso = now.toISOString();

  const digestRead = buildAppDeps().operatorHealthDigestRead;
  const suppressRecovery = await digestRead.hadOperatorIncidentsResolveAllInWindow(
    windowStartIso,
    windowEndIso,
  );

  const input = await collectOperatorHealthDigestInput({
    windowStartIso,
    windowEndIso,
    suppressRecovery,
  });
  const digest = buildOperatorHealthDigest(input);

  const recipients = await delivery.loadRecipients();
  const deliveries = prepareOperatorHealthDigestDeliveries({
    localDate,
    occurredAt: now.toISOString(),
    lines: digest.lines,
    title:
      digest.icon === '🛑'
        ? '🛑 ! Отказ провайдера доставки'
        : digest.hasIssues
          ? 'Сводка здоровья системы'
          : 'Всё в порядке',
    url: '/app/admin/system-health',
    config: cfg,
    recipients,
  });
  if (deliveries.length === 0) return { sent: false, reason: 'no_recipients', dedupKey };
  const inserted = await delivery.enqueue(deliveries);
  if (inserted === 0) return { sent: false, reason: 'dedup', dedupKey };

  // D-d, пульс 2: сводка, которая не запустилась, выглядит ровно как тихий день.
  // Поэтому у неё собственный пульс, и алертом является его отсутствие.
  await pingOperatorHeartbeatBestEffort('digest', 'digest_tick', { dedupKey });

  return { sent: true, dedupKey };
}
