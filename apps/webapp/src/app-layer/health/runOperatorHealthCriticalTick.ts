import { randomUUID } from "node:crypto";
import { collectCriticalHealthSignals } from "@/app-layer/health/collectCriticalHealthSignals";
import { classifyCriticalHealthSignals } from "@/modules/operator-health/criticalHealthSignals";
import { dispatchOperatorAlert } from "@/modules/operator-alerts/dispatchOperatorAlert";

const ALERT_CLAIM_LEASE_MS = 10 * 60 * 1_000;

/**
 * Critical tick: classify матрицы §3 → `dispatchOperatorAlert` (block critical).
 */
export async function runOperatorHealthCriticalTick(now = new Date()): Promise<{ alerted: number; keys: string[] }> {
  const input = await collectCriticalHealthSignals();
  const candidates = classifyCriticalHealthSignals(input);
  const outboundProviderIncidents = input.outboundDeliveryProvider?.openIncidents ?? [];
  const keys: string[] = [];
  let alerted = 0;

  for (const c of candidates) {
    const usesIncidentCadence = c.topic === "outbound_delivery_provider" && outboundProviderIncidents.length > 0;
    if (usesIncidentCadence) {
      const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
      const writePort = buildAppDeps().operatorHealthWrite;
      const claimedIncidentIds: string[] = [];
      for (let attempt = 0; attempt < outboundProviderIncidents.length; attempt += 1) {
        const claim = await writePort.claimDueOutboundProviderAlert({
          nowIso: now.toISOString(),
          staleBeforeIso: new Date(now.getTime() - ALERT_CLAIM_LEASE_MS).toISOString(),
          claimToken: randomUUID(),
          excludeIncidentIds: claimedIncidentIds,
        });
        if (!claim) break;
        claimedIncidentIds.push(claim.id);

        try {
          const result = await dispatchOperatorAlert({
            block: "critical",
            topic: c.topic,
            dedupKey: c.dedupKey,
            deliveryIdentity: `incident:${claim.id}:phase:${claim.phase}`,
            lines: c.lines,
            pushTitle: c.pushTitle,
            pushUrl: "/app/doctor/system-health",
            deduplication: "incident_cadence",
          });
          if (!result.dispatched) {
            await writePort.releaseOutboundProviderAlertClaim({ incidentId: claim.id, claimToken: claim.claimToken });
            break;
          }
          const completed = await writePort.completeOutboundProviderAlertClaim({
            incidentId: claim.id,
            phase: claim.phase,
            claimToken: claim.claimToken,
            sentAtIso: now.toISOString(),
          });
          if (completed) {
            alerted += 1;
            keys.push(`${c.dedupKey}:${claim.id}:${claim.phase}`);
          }
        } catch (error) {
          await writePort.releaseOutboundProviderAlertClaim({ incidentId: claim.id, claimToken: claim.claimToken });
          throw error;
        }
      }
      continue;
    }

    const result = await dispatchOperatorAlert({
      block: "critical",
      topic: c.topic,
      dedupKey: c.dedupKey,
      lines: c.lines,
      pushTitle: c.pushTitle,
      pushUrl: "/app/doctor/system-health",
    });
    if (result.dispatched) {
      alerted += 1;
      keys.push(c.dedupKey);
    }
  }

  return { alerted, keys };
}
