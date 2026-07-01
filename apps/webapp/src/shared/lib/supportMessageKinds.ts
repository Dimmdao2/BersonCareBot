type SupportMessageIdentity = {
  integratorMessageId: string | null;
  source: string | null;
};

const NOTIFICATION_SOURCES = new Set(["doctor_broadcast", "appointment_lifecycle"]);

export function isSupportNotificationMessage(message: SupportMessageIdentity): boolean {
  const source = (message.source ?? "").trim();
  if (NOTIFICATION_SOURCES.has(source)) return true;

  const messageId = (message.integratorMessageId ?? "").trim();
  return (
    messageId.startsWith("broadcast:") ||
    messageId.startsWith("booking-created:") ||
    messageId.startsWith("booking-cancelled:") ||
    messageId.startsWith("booking-rescheduled:")
  );
}

export function isSupportChatMessage(message: SupportMessageIdentity): boolean {
  return !isSupportNotificationMessage(message);
}
