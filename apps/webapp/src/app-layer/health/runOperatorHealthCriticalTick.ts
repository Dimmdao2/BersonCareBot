import { collectCriticalHealthSignals } from "@/app-layer/health/collectCriticalHealthSignals";
import { classifyCriticalHealthSignals } from "@/modules/operator-health/criticalHealthSignals";
import { dispatchOperatorAlert } from "@/modules/operator-alerts/dispatchOperatorAlert";
import { listDueOutboundProviderIncidents } from "@/modules/operator-health/outboundProviderIncidentCadence";

/**
 * Critical tick: classify матрицы §3 → `dispatchOperatorAlert` (block critical).
 */
export async function runOperatorHealthCriticalTick(now = new Date()): Promise<{ alerted: number; keys: string[] }> {
  const input = await collectCriticalHealthSignals();
  const candidates = classifyCriticalHealthSignals(input);
  const outboundProviderIncidents = input.outboundDeliveryProvider?.openIncidents ?? [];
  const dueOutboundProviderIncidents = listDueOutboundProviderIncidents(
    outboundProviderIncidents,
    now.getTime(),
  );
  const keys: string[] = [];
  let alerted = 0;

  for (const c of candidates) {
    const usesIncidentCadence = c.topic === "outbound_delivery_provider" && outboundProviderIncidents.length > 0;
    if (usesIncidentCadence && dueOutboundProviderIncidents.length === 0) continue;

    const result = await dispatchOperatorAlert({
      block: "critical",
      topic: c.topic,
      dedupKey: c.dedupKey,
      lines: c.lines,
      pushTitle: c.pushTitle,
      pushUrl: "/app/doctor/system-health",
      ...(usesIncidentCadence ? { deduplication: "incident_cadence" as const } : {}),
    });
    if (result.dispatched) {
      alerted += 1;
      keys.push(c.dedupKey);
      if (usesIncidentCadence) {
        const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
        await buildAppDeps().operatorHealthWrite.markOpenIncidentsAlertSent({
          incidentIds: dueOutboundProviderIncidents.map((incident) => incident.id),
          alertSentAtIso: now.toISOString(),
        });
      }
    }
  }

  return { alerted, keys };
}
