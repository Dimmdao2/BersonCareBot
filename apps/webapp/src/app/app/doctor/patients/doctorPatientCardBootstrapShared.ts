/** Client-safe envelope helpers for patient-card bootstrap (no server imports). */

export type BootstrapEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: 'load_failed' };

export function envelopeFromSettled<T>(result: PromiseSettledResult<T>): BootstrapEnvelope<T> {
  if (result.status === 'fulfilled') return { ok: true, value: result.value };
  return { ok: false, error: 'load_failed' };
}

export function unwrapBootstrapEnvelope<T>(
  envelope: BootstrapEnvelope<T> | null | undefined,
): T | null {
  if (!envelope?.ok) return null;
  return envelope.value;
}

export function isBootstrapEnvelopeFailed(
  envelope: BootstrapEnvelope<unknown> | null | undefined,
): boolean {
  return envelope != null && !envelope.ok;
}
