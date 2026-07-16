import { reportSaasIsolationEventBestEffort } from "@/infra/saasIsolationReporterRuntime";
import { getCurrentWebappDbOperationFamily } from "@/infra/db/saasIsolationOperationContext";
import type { SaasIsolationSourceOperation } from "@/modules/operator-health/saasIsolationDiagnostics";

function currentSourceOperation(): SaasIsolationSourceOperation {
  return getCurrentWebappDbOperationFamily() ?? "webapp_db_request";
}

export function classifyPostgresIsolationDenial(
  error: unknown,
): "rls_denial" | "role_pool_mismatch" | null {
  if (typeof error !== "object" || error === null) return null;
  const value = error as { code?: unknown; message?: unknown };
  if (value.code !== "42501" || typeof value.message !== "string") return null;
  if (/row-level security|row level security|policy/i.test(value.message)) return "rls_denial";
  if (/permission denied for (table|schema|sequence|function|relation)/i.test(value.message)) {
    return "role_pool_mismatch";
  }
  return null;
}

export async function reportPrincipalSetupFailure(error: unknown): Promise<void> {
  const missing = error instanceof Error && /principal context is required/i.test(error.message);
  await reportSaasIsolationEventBestEffort({
    eventClass: missing ? "missing_principal" : "invalid_signature_or_install",
    sourceService: "webapp",
    sourceOperation: currentSourceOperation(),
  });
}

export async function reportDbQueryFailure(error: unknown): Promise<void> {
  const eventClass = classifyPostgresIsolationDenial(error);
  if (!eventClass) return;
  await reportSaasIsolationEventBestEffort({
    eventClass,
    sourceService: "webapp",
    sourceOperation: currentSourceOperation(),
  });
}

export async function reportDbCleanupFailure(): Promise<void> {
  await reportSaasIsolationEventBestEffort({
    eventClass: "cleanup_failure",
    sourceService: "webapp",
    sourceOperation: currentSourceOperation(),
  });
}
