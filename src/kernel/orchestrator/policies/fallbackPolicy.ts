/** Каркас policy fallback-канала доставки. */
export type FallbackPolicyDecision = 'none' | 'sms';

/** Временная policy: fallback выключен. */
export function decideFallback(): FallbackPolicyDecision {
  return 'none';
}
