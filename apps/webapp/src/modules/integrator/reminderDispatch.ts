/**
 * Legacy HTTP entry for integrator → webapp reminder push (POST /api/integrator/reminders/dispatch).
 *
 * **Production patient reminders** are planned and enqueued by integrator
 * `schedule.tick` → `reminders.dispatchDue` → `public.outgoing_delivery_queue` (see
 * `apps/integrator/src/content/scheduler/scripts.json` and deploy unit `bersoncarebot-scheduler-prod`).
 * This handler remains intentionally non-durable so callers do not assume messenger delivery here.
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
  if (process.env.NODE_ENV !== "production") {
    console.info("[integrator] reminder dispatch", body.userId, body.message?.title ?? "", body.channelBindings ?? {});
  }
  return {
    accepted: false,
    reason: "use_integrator_reminders_dispatchDue_not_http_dispatch",
  };
}
