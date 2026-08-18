import { randomUUID } from 'node:crypto';
import { collectCriticalHealthSignals } from '@/app-layer/health/collectCriticalHealthSignals';
import { classifyCriticalHealthSignals } from '@/modules/operator-health/criticalHealthSignals';
import { dispatchOperatorAlert } from '@/modules/operator-alerts/dispatchOperatorAlert';
import { CRITICAL_ALERT_CADENCE_INTEGRATION } from '@/modules/operator-health/ports';
import {
  pingPipelineHeartbeatOnConfirmedDelivery,
  readOperatorHeartbeatVerdicts,
} from '@/app-layer/health/deliveryHeartbeatObserver';

const ALERT_CLAIM_LEASE_MS = 10 * 60 * 1_000;

/**
 * Critical tick: classify матрицы §3 → `dispatchOperatorAlert` (block critical).
 */
export async function runOperatorHealthCriticalTick(
  now = new Date(),
): Promise<{ alerted: number; keys: string[] }> {
  const input = await collectCriticalHealthSignals();

  // D-d, пульс 1: бьётся ТОЛЬКО когда ватермарка подтверждённых доставок сдвинулась вперёд.
  // Пульс «просто потому, что тик отработал» доказывал бы работу планировщика, а не доставки,
  // и в июле светился бы зелёным.
  const pingResult = await pingPipelineHeartbeatOnConfirmedDelivery(
    input.deliveryEvidence?.lastConfirmedDeliveryAt ?? null,
  );
  // Вердикты собраны ДО пульса; если пульс только что прошёл, перечитываем — иначе свежая
  // подтверждённая доставка всё равно подняла бы алерт об отсутствии пульса.
  const signals =
    pingResult === 'pinged'
      ? {
          ...input,
          heartbeats: await readOperatorHeartbeatVerdicts().catch(() => input.heartbeats ?? []),
        }
      : input;

  const candidates = classifyCriticalHealthSignals(signals);
  const outboundProviderIncidents = signals.outboundDeliveryProvider?.openIncidents ?? [];
  const keys: string[] = [];
  let alerted = 0;

  const { buildAppDeps } = await import('@/app-layer/di/buildAppDeps');
  const writePort = buildAppDeps().operatorHealthWrite;
  // #1038: dedup keys of every candidate taking the generic cadence path this tick — anything
  // NOT in this set at the end has cleared, so its incident (if any) is resolved and the NEXT
  // occurrence starts a fresh T0 instead of staying silent behind a stale row.
  const activeGenericDedupKeys: string[] = [];

  for (const c of candidates) {
    const usesIncidentCadence =
      c.topic === 'outbound_delivery_provider' && outboundProviderIncidents.length > 0;
    if (usesIncidentCadence) {
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
            block: 'critical',
            topic: c.topic,
            dedupKey: c.dedupKey,
            deliveryIdentity: `incident:${claim.id}:phase:${claim.phase}`,
            lines: c.lines,
            pushTitle: c.pushTitle,
            pushUrl: '/app/admin/system-health',
            deduplication: 'incident_cadence',
          });
          if (!result.dispatched) {
            await writePort.releaseOutboundProviderAlertClaim({
              incidentId: claim.id,
              claimToken: claim.claimToken,
            });
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
          await writePort.releaseOutboundProviderAlertClaim({
            incidentId: claim.id,
            claimToken: claim.claimToken,
          });
          throw error;
        }
      }
      continue;
    }

    if (c.topic === 'outbound_delivery_provider') {
      // Legacy fallback: `outgoingDelivery.deadTotal > 0` can raise this candidate even when
      // there is no open provider incident row (rare transient case). This topic already has
      // owner-approved P1-P4 escalation (taskdb #950); left on the flat dedup path as-is,
      // out of #1038's scope, rather than folding it into the generic cadence below and
      // risking the closed outbound-provider flow.
      const result = await dispatchOperatorAlert({
        block: 'critical',
        topic: c.topic,
        dedupKey: c.dedupKey,
        lines: c.lines,
        pushTitle: c.pushTitle,
        pushUrl: '/app/admin/system-health',
      });
      if (result.dispatched) {
        alerted += 1;
        keys.push(c.dedupKey);
      }
      continue;
    }

    // #1038: generic escalating cadence (T0 -> +1h -> daily digest only) for every other
    // critical topic, reusing the SAME operator_incidents claim/complete/release lifecycle P3
    // built for outbound_delivery_provider instead of the flat 24h dedup that was silently
    // swallowing repeats (webapp_db down, tenant isolation breach, dead heartbeats, ...).
    activeGenericDedupKeys.push(c.dedupKey);
    const touched = await writePort.openOrTouchCriticalAlertIncident({
      dedupKey: c.dedupKey,
      direction: c.topic,
      integration: CRITICAL_ALERT_CADENCE_INTEGRATION,
      nowIso: now.toISOString(),
      errorDetail: c.lines[0] ?? null,
    });
    const claim = await writePort.claimIncidentAlertIfDue({
      incidentId: touched.id,
      nowIso: now.toISOString(),
      staleBeforeIso: new Date(now.getTime() - ALERT_CLAIM_LEASE_MS).toISOString(),
      claimToken: randomUUID(),
    });
    if (!claim) continue;
    try {
      const result = await dispatchOperatorAlert({
        block: 'critical',
        topic: c.topic,
        dedupKey: c.dedupKey,
        deliveryIdentity: `incident:${claim.id}:phase:${claim.phase}`,
        lines: c.lines,
        pushTitle: c.pushTitle,
        pushUrl: '/app/admin/system-health',
        deduplication: 'incident_cadence',
      });
      if (!result.dispatched) {
        await writePort.releaseOutboundProviderAlertClaim({
          incidentId: claim.id,
          claimToken: claim.claimToken,
        });
        continue;
      }
      const completed = await writePort.completeOutboundProviderAlertClaim({
        incidentId: claim.id,
        phase: claim.phase,
        claimToken: claim.claimToken,
        sentAtIso: now.toISOString(),
      });
      if (completed) {
        alerted += 1;
        keys.push(c.dedupKey);
      }
    } catch (error) {
      await writePort.releaseOutboundProviderAlertClaim({
        incidentId: claim.id,
        claimToken: claim.claimToken,
      });
      throw error;
    }
  }

  // Anything not active this tick has cleared — resolve it so a later recurrence pages fresh
  // instead of staying silent behind an incident row that never got marked resolved.
  // Scoped to THIS cadence: the reconciliation sweep's incidents are not in `activeGenericDedupKeys`
  // and must not be closed here — a five-minute tick closing an hourly sweep's incident would make
  // the next sweep reopen it and page the owner every hour for one unchanged discrepancy.
  await writePort.resolveStaleCriticalAlertIncidents({
    integration: CRITICAL_ALERT_CADENCE_INTEGRATION,
    activeDedupKeys: activeGenericDedupKeys,
  });

  return { alerted, keys };
}
