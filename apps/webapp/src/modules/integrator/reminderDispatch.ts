/**
 * Legacy HTTP entry for integrator → webapp reminder push (POST /api/integrator/reminders/dispatch).
 *
 * **Production patient reminders** are planned and enqueued by the webapp-owned signed-wake
 * materializer. This retired handler remains intentionally non-durable so callers cannot create a
 * second delivery path.
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

export async function handleReminderDispatch(
  body: ReminderDispatchBody,
): Promise<ReminderDispatchResult> {
  if (process.env.NODE_ENV !== 'production') {
    console.info(
      '[integrator] reminder dispatch',
      body.userId,
      body.message?.title ?? '',
      body.channelBindings ?? {},
    );
  }
  return {
    accepted: false,
    reason: 'use_signed_patient_reminder_materialization_wake',
  };
}
