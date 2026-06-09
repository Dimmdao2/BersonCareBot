export const WEBHOOK_BURST_MIN_COUNT = 5;
export const WEBHOOK_BURST_WINDOW_MINUTES = 15;
/** Retention for burst event rows (well beyond P8 window). */
export const WEBHOOK_ERROR_EVENTS_RETENTION_HOURS = 48;

export type WebhookBurstSignal = {
  source: string;
  errorClass: string;
  count: number;
};

export function isWebhookBurstCritical(signal: WebhookBurstSignal): boolean {
  return signal.count >= WEBHOOK_BURST_MIN_COUNT;
}
