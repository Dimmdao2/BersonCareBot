/**
 * Маппинг сообщения ошибки синка Google Calendar → `error_class` из MVP taxonomy.
 */
export function mapGoogleCalendarSyncErrorToClass(message: string): string {
  const m = message.trim();
  if (m === 'GOOGLE_EVENT_ID_MISSING') return 'GOOGLE_EVENT_ID_MISSING';
  if (m === 'GOOGLE_TOKEN_MISSING') return 'GOOGLE_TOKEN_HTTP_missing';
  const tokenExact = /^GOOGLE_TOKEN_HTTP_(\d+)$/.exec(m);
  if (tokenExact) return `GOOGLE_TOKEN_HTTP_${tokenExact[1]}`;
  const tokenPrefix = /^GOOGLE_TOKEN_HTTP_(\d+)/.exec(m);
  if (tokenPrefix) return `GOOGLE_TOKEN_HTTP_${tokenPrefix[1]}`;
  const calPrefix = /^GOOGLE_CALENDAR_HTTP_(\d+)/.exec(m);
  if (calPrefix) return `GOOGLE_CALENDAR_HTTP_${calPrefix[1]}`;
  // eslint-disable-next-line no-secrets/no-secrets -- stable error_class key for operator_incidents taxonomy
  if (m.includes('GOOGLE_CALENDAR_HTTP_')) return 'GOOGLE_CALENDAR_HTTP_unknown';
  if (m.includes('GOOGLE_TOKEN_HTTP_')) return 'GOOGLE_TOKEN_HTTP_unknown';
  return 'unknown_error_class';
}
