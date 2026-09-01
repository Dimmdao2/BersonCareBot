/**
 * ONE classification of tenant-isolation failures for every process that reports them.
 *
 * Before this module the integrator/webapp shared one copy through `@bersoncare/db-principal` while
 * `apps/media-worker` carried a hand-copied second one whose unknown branch returned `null` — the
 * media worker silently dropped exactly the failures nobody had classified yet, even though the
 * receiving end (`app.report_saas_isolation_event`) accepts `unclassified_background_operation`.
 * Two copies of a predicate drift; the one that drifts here loses evidence of a wall failing.
 *
 * This lives in `@bersoncare/error-tracking` and not in `@bersoncare/db-principal` on purpose: it is
 * pure observability, and the media worker must never depend on the DB-principal runtime — it holds
 * no database credential at all (`deploy/host/saas-c2-secret-preflight.mjs` fails the deploy if it
 * ever gets one) and reaches the database only through the authenticated webapp control seam.
 */

/** Closed vocabulary; mirrored by the `saas_isolation_events` CHECK constraint. */
export const SAAS_ISOLATION_EVENT_CLASSES = [
  'missing_principal',
  'invalid_signature_or_install',
  'role_pool_mismatch',
  'rls_denial',
  'cleanup_failure',
  'unclassified_background_operation',
] as const;

export type SaasIsolationTelemetryEventClass = (typeof SAAS_ISOLATION_EVENT_CLASSES)[number];

function errorShape(error: unknown): { code?: unknown; message?: unknown } {
  return typeof error === 'object' && error !== null
    ? (error as { code?: unknown; message?: unknown })
    : {};
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  const value = errorShape(error);
  if (typeof value.message === 'string') return value.message;
  return error instanceof Error ? error.message : '';
}

/**
 * Never returns "no class": an isolation failure nobody recognized is still an isolation failure and
 * is stored as `unclassified_background_operation` rather than disappearing.
 */
export function classifySaasIsolationFailure(error: unknown): SaasIsolationTelemetryEventClass {
  const value = errorShape(error);
  const message = errorMessage(error);
  if (/principal context is required/i.test(message)) return 'missing_principal';
  if (/signed context|signature|install_signed_context/i.test(message))
    return 'invalid_signature_or_install';
  if (
    (value.code === '42501' || value.code === undefined) &&
    /row-level security|row level security|policy/i.test(message)
  )
    return 'rls_denial';
  if (
    (value.code === '42501' || value.code === undefined) &&
    /permission denied for (table|schema|sequence|function|relation)/i.test(message)
  ) {
    return 'role_pool_mismatch';
  }
  if (/release_principal_context|cleanup/i.test(message)) return 'cleanup_failure';
  return 'unclassified_background_operation';
}

/**
 * Whether a failure belongs to the isolation surface at all. Ordinary product/transport errors (an S3
 * timeout, a broken JSON body) are NOT isolation events and must not be reported as such.
 */
export function isRecognizedSaasIsolationFailure(error: unknown): boolean {
  const value = errorShape(error);
  const message = typeof error === 'string' ? error : errorMessage(error);
  return (
    value.code === '42501' ||
    /principal context is required|signed context|signature|install_signed_context|release_principal_context|permission denied for (table|schema|sequence|function|relation)|row-level security|row level security/i.test(
      message,
    )
  );
}
