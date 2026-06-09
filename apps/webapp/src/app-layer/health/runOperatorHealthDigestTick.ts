import { collectOperatorHealthDigestInput } from "@/app-layer/health/collectOperatorHealthDigestInput";
import { tickProjectionDigestDebounce } from "@/app-layer/health/tickProjectionDigestDebounce";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { buildOperatorHealthDigest } from "@/modules/operator-health/buildOperatorHealthDigest";
import {
  buildDigestDedupKey,
  isDigestSendSlot,
  resolveDigestWindowStartIso,
} from "@/modules/operator-health/digestSchedule";
import { dispatchOperatorAlert } from "@/modules/operator-alerts/dispatchOperatorAlert";
import { getOperatorAlertDedupPort } from "@/modules/operator-alerts/operatorAlertRuntime";
import {
  isOperatorAlertBlockEnabled,
  mergeOperatorHealthAlertConfigFromLegacy,
  OPERATOR_HEALTH_ALERT_CONFIG_KEY,
  type OperatorHealthAlertConfig,
} from "@/modules/operator-alerts/operatorHealthAlertConfig";
import { ADMIN_INCIDENT_ALERT_CONFIG_KEY } from "@/modules/admin-incidents/adminIncidentAlertConfig";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { getConfigValue } from "@/modules/system-settings/configAdapter";

export type RunOperatorHealthDigestTickResult = {
  sent: boolean;
  reason?: "disabled" | "not_slot" | "dedup" | "no_recipients";
  dedupKey?: string;
};

async function loadDigestConfig(): Promise<OperatorHealthAlertConfig> {
  const [operatorRaw, legacyRaw] = await Promise.all([
    getConfigValue(OPERATOR_HEALTH_ALERT_CONFIG_KEY, ""),
    getConfigValue(ADMIN_INCIDENT_ALERT_CONFIG_KEY, ""),
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
 * Digest tick: 1×/сутки в `digestTime` (TZ `app_display_timezone`) → `dispatchOperatorAlert` (block digest).
 */
export async function runOperatorHealthDigestTick(
  now = new Date(),
): Promise<RunOperatorHealthDigestTickResult> {
  await tickProjectionDigestDebounce(now.getTime());

  const cfg = await loadDigestConfig();
  if (!isOperatorAlertBlockEnabled(cfg, "digest")) {
    return { sent: false, reason: "disabled" };
  }

  const timeZone = await getAppDisplayTimeZone();
  if (!isDigestSendSlot(now, timeZone, cfg.digestTime)) {
    return { sent: false, reason: "not_slot" };
  }

  const dedupKey = buildDigestDedupKey(now, timeZone);
  const dedupPort = getOperatorAlertDedupPort();
  if (dedupPort) {
    const recent = await dedupPort.wasSentWithinHours(dedupKey, 24);
    if (recent) return { sent: false, reason: "dedup", dedupKey };
  }

  const lastDigestSentAt = dedupPort
    ? await dedupPort.getLatestSentAtByDedupKeyPrefix("digest:")
    : null;
  const windowStartIso = resolveDigestWindowStartIso(lastDigestSentAt, now);
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

  const result = await dispatchOperatorAlert({
    block: "digest",
    topic: "operator_health_digest",
    dedupKey,
    lines: digest.lines,
    pushTitle: digest.hasIssues ? "Сводка здоровья системы" : "Всё в порядке",
    pushUrl: "/app/doctor/system-health",
  });

  if (!result.dispatched) {
    const reason =
      result.reason === "dedup"
        ? "dedup"
        : result.reason === "disabled"
          ? "disabled"
          : "no_recipients";
    return { sent: false, reason, dedupKey };
  }

  return { sent: true, dedupKey };
}
