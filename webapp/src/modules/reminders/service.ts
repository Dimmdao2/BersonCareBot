export type ReminderDispatchRequest = {
  idempotencyKey: string;
  userId: string;
  message: {
    title: string;
    body: string;
  };
};

export function validateReminderDispatchPayload(value: unknown): value is ReminderDispatchRequest {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  const message = payload.message as Record<string, unknown> | undefined;

  return (
    typeof payload.idempotencyKey === "string" &&
    typeof payload.userId === "string" &&
    typeof message?.title === "string" &&
    typeof message?.body === "string"
  );
}
