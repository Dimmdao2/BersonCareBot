import type { Action, ActionResult, DomainContext } from '../../../contracts/index.js';
import type { ExecutorDeps } from '../helpers.js';

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** Scheduler action boundary: it only wakes the webapp-owned business materializer. */
export async function handleScheduledMaterialization(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps,
): Promise<ActionResult> {
  if (action.type !== 'patientReminders.materializeWake') {
    return {
      actionId: action.id,
      status: 'skipped',
      error: 'unsupported scheduled materialization',
    };
  }
  const organizationId =
    stringValue(action.params.organizationId) ??
    stringValue(recordValue(ctx.event.payload).organizationId);
  if (!organizationId || !deps.webappEventsPort?.wakePatientReminderMaterialization) {
    return {
      actionId: action.id,
      status: 'failed',
      error: 'patient reminder materialization wake unavailable',
    };
  }
  const result = await deps.webappEventsPort.wakePatientReminderMaterialization({
    organizationId,
    wakeId: ctx.event.meta.eventId,
  });
  if (!result.ok) {
    return {
      actionId: action.id,
      status: 'failed',
      error: `patient reminder materialization wake failed:${result.status}:${result.error ?? 'unavailable'}`,
    };
  }
  return { actionId: action.id, status: 'success' };
}
