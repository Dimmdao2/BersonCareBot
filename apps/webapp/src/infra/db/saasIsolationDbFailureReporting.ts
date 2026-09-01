import { reportSaasIsolationEventBestEffort } from '@/infra/saasIsolationReporterRuntime';
import { getCurrentWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import type { SaasIsolationSourceOperation } from '@/modules/operator-health/saasIsolationDiagnostics';
import {
  classifySaasIsolationFailure,
  type SaasIsolationTelemetryEventClass,
} from '@bersoncare/error-tracking';

function currentSourceOperation(): SaasIsolationSourceOperation {
  return getCurrentWebappDbOperationFamily() ?? 'webapp_db_request';
}

export function classifyPostgresIsolationDenial(
  error: unknown,
): SaasIsolationTelemetryEventClass | null {
  if (typeof error !== 'object' || error === null) return null;
  if ((error as { code?: unknown }).code !== '42501') return null;
  return classifySaasIsolationFailure(error);
}

export async function reportPrincipalSetupFailure(error: unknown): Promise<void> {
  const missing = error instanceof Error && /principal context is required/i.test(error.message);
  await reportSaasIsolationEventBestEffort({
    eventClass: missing ? 'missing_principal' : 'invalid_signature_or_install',
    sourceService: 'webapp',
    sourceOperation: currentSourceOperation(),
  });
}

export async function reportDbQueryFailure(error: unknown): Promise<void> {
  const eventClass = classifyPostgresIsolationDenial(error);
  if (!eventClass) return;
  await reportSaasIsolationEventBestEffort({
    eventClass,
    sourceService: 'webapp',
    sourceOperation: currentSourceOperation(),
  });
}

export async function reportDbCleanupFailure(): Promise<void> {
  await reportSaasIsolationEventBestEffort({
    eventClass: 'cleanup_failure',
    sourceService: 'webapp',
    sourceOperation: currentSourceOperation(),
  });
}
