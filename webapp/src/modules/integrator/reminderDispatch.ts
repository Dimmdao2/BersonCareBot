/**
 * Domain handling for reminder dispatch (POST /api/integrator/reminders/dispatch).
 * Parsed body shape per contracts/integrator-reminders-dispatch-body.json and ReminderDispatchRequest.
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
  // MVP: log. Later: enqueue for orchestrator or HTTP call to tgcarebot with signature.
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.info("[integrator] reminder dispatch", body.userId, body.message?.title ?? "");
  }
  return {
    accepted: false,
    reason: "durable reminder dispatch is not implemented",
  };
}
