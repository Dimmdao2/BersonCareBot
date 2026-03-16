/**
 * Domain handling for integrator webhook events (POST /api/integrator/events).
 * Parsed body shape per contracts/integrator-events-body.json.
 */
export type IntegratorEventBody = {
  eventType: string;
  eventId?: string;
  occurredAt?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
};

export type IntegratorHandleResult = {
  accepted: boolean;
  reason?: string;
};

export async function handleIntegratorEvent(event: IntegratorEventBody): Promise<IntegratorHandleResult> {
  // MVP: log and return. Later: switch on eventType, update appointments, contact verified, etc.
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.info("[integrator] event received", event.eventType, event.eventId ?? "");
  }
  return {
    accepted: false,
    reason: "durable ingest is not implemented",
  };
}
