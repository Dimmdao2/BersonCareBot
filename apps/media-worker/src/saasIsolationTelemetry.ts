import type { MediaWorkerControlPort, MediaWorkerIsolationEventClass } from './control.js';

const CIRCUIT_OPEN_MS = 30_000;

function classification(error: unknown): MediaWorkerIsolationEventClass | null {
  const record = typeof error === 'object' && error !== null ? error as { code?: unknown; message?: unknown } : {};
  const message = typeof error === 'string' ? error : typeof record.message === 'string' ? record.message : '';
  if (/principal context is required/i.test(message)) return 'missing_principal';
  if (/signed context|signature|install_signed_context/i.test(message)) return 'invalid_signature_or_install';
  if ((record.code === '42501' || record.code === undefined) && /row-level security|row level security|policy/i.test(message)) return 'rls_denial';
  if ((record.code === '42501' || record.code === undefined) && /permission denied for (table|schema|sequence|function|relation)/i.test(message)) return 'role_pool_mismatch';
  if (/release_principal_context|cleanup/i.test(message)) return 'cleanup_failure';
  return null;
}

/** A failed telemetry command is isolated from the original worker failure and circuit-broken. */
export function createMediaWorkerIsolationReporter(
  control: Pick<MediaWorkerControlPort, 'isolationFailure'>,
  now: () => number = Date.now,
) {
  let circuitOpenUntil = 0;
  return {
    report(error: unknown): void {
      const eventClass = classification(error);
      if (!eventClass || now() < circuitOpenUntil) return;
      void control.isolationFailure(eventClass).catch(() => {
        circuitOpenUntil = now() + CIRCUIT_OPEN_MS;
      });
    },
    inspectForTest() { return { circuitOpenUntil }; },
  };
}
