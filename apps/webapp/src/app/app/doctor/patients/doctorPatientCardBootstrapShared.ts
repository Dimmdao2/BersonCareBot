/** Client-safe envelope helpers for patient-card bootstrap (no server imports). */

export type BootstrapEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: 'load_failed' };

/**
 * The rejection IS the signal. A loader handed to the bootstrap's `Promise.allSettled` must be left
 * free to reject: that rejection is the only thing separating "this section could not be read" from
 * "this section is legitimately empty", and `isBootstrapEnvelopeFailed` is what the tabs render the
 * difference from.
 *
 * So do not attach `.catch(() => null)` / `.catch(() => [])` to a loader on its way in. Four of them
 * had accumulated (patient packages on the overview, records and finances tabs; payment history on
 * finances) and each settled *fulfilled* with an empty value, so the envelope reported `ok: true`
 * and a refused read reached the doctor as "нет пакетов" or an empty payment timeline — on a
 * patient's money and treatment surfaces. Where a section is genuinely unavailable (the mechanic is
 * off, the port is unwired), express that as `Promise.resolve(null)`: a fulfilled empty that says so.
 */
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
