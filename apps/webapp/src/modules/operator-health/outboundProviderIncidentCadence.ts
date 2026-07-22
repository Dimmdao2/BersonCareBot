import type { OperatorIncidentOpenRow } from "./ports";
import { OUTBOUND_PROVIDER_FAILURE_DIRECTION } from "./criticalHealthSignals";

export const OUTBOUND_PROVIDER_REPEAT_AFTER_MS = 60 * 60 * 1_000;

export type OutboundProviderIncidentAlertPhase = "initial" | "one_hour_repeat";

/**
 * `alert_sent_at` is the durable last-alert marker on the existing incident row.
 * A timestamp before opened+1h is the initial alert; a timestamp at/after that
 * boundary completes critical escalation and leaves the daily digest as the only repeat.
 */
export function outboundProviderIncidentAlertPhase(
  incident: OperatorIncidentOpenRow,
  nowMs: number,
): OutboundProviderIncidentAlertPhase | null {
  if (incident.direction !== OUTBOUND_PROVIDER_FAILURE_DIRECTION) return null;

  const openedAtMs = Date.parse(incident.openedAt);
  if (!Number.isFinite(openedAtMs) || nowMs < openedAtMs) return null;
  if (incident.alertSentAt === null) return "initial";

  const lastAlertedAtMs = Date.parse(incident.alertSentAt);
  if (!Number.isFinite(lastAlertedAtMs)) return "initial";
  const repeatBoundaryMs = openedAtMs + OUTBOUND_PROVIDER_REPEAT_AFTER_MS;
  if (lastAlertedAtMs < repeatBoundaryMs && nowMs >= repeatBoundaryMs) {
    return "one_hour_repeat";
  }
  return null;
}

export function listDueOutboundProviderIncidents(
  incidents: OperatorIncidentOpenRow[],
  nowMs: number,
): OperatorIncidentOpenRow[] {
  return incidents.filter((incident) => outboundProviderIncidentAlertPhase(incident, nowMs) !== null);
}
