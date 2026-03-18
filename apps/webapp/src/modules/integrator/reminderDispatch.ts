/**
 * Domain handling for reminder dispatch (POST /api/integrator/reminders/dispatch).
 * Parsed body shape per contracts/integrator-reminders-dispatch-body.json and ReminderDispatchRequest.
 *
 * Delivery targets: when building the dispatch body (e.g. from scheduler), use
 * getDeliveryTargetsForUser(userId, bindings, preferencesPort) from channel-preferences/deliveryTargets
 * to fill channelBindings with all linked channels enabled for notifications (telegram, max).
 * The integrator will then fan out to each channel in channelBindings.
 */
export type ReminderDispatchBody = {
  idempotencyKey?: string;
  userId: string;
  channelBindings?: Record<string, string>;
  message: { title: string; body: string };
  actions?: Array<{ id: string; label: string }>;
};

export type ReminderDispatchResult = {
  accepted: boolean;
  reason?: string;
};

export async function handleReminderDispatch(body: ReminderDispatchBody): Promise<ReminderDispatchResult> {
  // MVP: log. Later: enqueue for orchestrator or HTTP call to tgcarebot with signature;
  // integrator will fan out to each channel in body.channelBindings (telegram, max).
  if (process.env.NODE_ENV !== "production") {
    console.info("[integrator] reminder dispatch", body.userId, body.message?.title ?? "", body.channelBindings ?? {});
  }
  return {
    accepted: false,
    reason: "durable reminder dispatch is not implemented",
  };
}
