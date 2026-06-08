export function formatTelegramUsernameMention(rawUsername: string | null | undefined): string | null {
  const trimmed = rawUsername?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/^@+/, "");
  if (!normalized) return null;
  return `@${normalized}`;
}

export function appendTelegramUsernameMentionToLabel(
  label: string,
  mention: string | null | undefined,
): string {
  const formatted = mention?.trim() ?? "";
  if (!formatted) return label;
  const withAt = formatted.startsWith("@") ? formatted : `@${formatted}`;
  if (label.includes(withAt)) return label;
  return `${label} ${withAt}`;
}

export function buildPatientNotifyFromLine(
  patientLabel: string,
  telegramUsernameMention?: string | null,
): string {
  const base = patientLabel.trim() || "Пациент";
  return `От: ${appendTelegramUsernameMentionToLabel(base, telegramUsernameMention)}`;
}
