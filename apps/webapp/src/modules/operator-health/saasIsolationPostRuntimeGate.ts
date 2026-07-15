import { randomUUID } from 'node:crypto';
import {
  SAAS_ISOLATION_REQUIRED_SERVICES,
  type RecordSaasIsolationCoverageInput,
  type SaasIsolationHealthPayload,
} from './saasIsolationDiagnostics';

export type SaasIsolationPostRuntimeGateDeps = {
  readHealth(): Promise<SaasIsolationHealthPayload>;
  recordCoverage(input: RecordSaasIsolationCoverageInput): Promise<void>;
  now(): Date;
  randomId(): string;
};

export type SaasIsolationPostRuntimeGateResult = {
  status: SaasIsolationHealthPayload['status'];
  activeExplained: number;
};

function assertIsoTimestamp(value: string): void {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error('saas_isolation_post_runtime_gate_invalid_started_at');
  }
}

function assertNoActiveUnexplained(
  health: SaasIsolationHealthPayload,
  phase: 'before_coverage' | 'after_coverage',
): void {
  if (health.active.unexplained > 0) {
    throw new Error(`saas_isolation_post_runtime_gate_active_unexplained_${phase}`);
  }
}

export async function runSaasIsolationPostRuntimeGate(
  startedAt: string,
  checksCount: number,
  deps: SaasIsolationPostRuntimeGateDeps,
): Promise<SaasIsolationPostRuntimeGateResult> {
  assertIsoTimestamp(startedAt);
  if (!Number.isSafeInteger(checksCount) || checksCount < SAAS_ISOLATION_REQUIRED_SERVICES.length) {
    throw new Error('saas_isolation_post_runtime_gate_invalid_checks_count');
  }

  // Read before recording coverage so an existing unexplained failure cannot be
  // resolved by the coverage write and disappear from the deploy decision.
  const beforeCoverage = await deps.readHealth();
  assertNoActiveUnexplained(beforeCoverage, 'before_coverage');

  const finishedAt = deps.now().toISOString();
  if (finishedAt < startedAt) {
    throw new Error('saas_isolation_post_runtime_gate_invalid_time_window');
  }
  const coverageId = deps.randomId();
  await deps.recordCoverage({
    id: coverageId,
    status: 'complete',
    startedAt,
    finishedAt,
    servicesChecked: [...SAAS_ISOLATION_REQUIRED_SERVICES],
    checksCount,
    unexpectedErrorsCount: 0,
  });

  const afterCoverage = await deps.readHealth();
  assertNoActiveUnexplained(afterCoverage, 'after_coverage');
  if (
    !afterCoverage.lastCoverage ||
    afterCoverage.lastCoverage.id !== coverageId ||
    afterCoverage.lastCoverage.status !== 'complete' ||
    afterCoverage.lastCoverage.unexpectedErrorsCount !== 0 ||
    !afterCoverage.coverageComplete ||
    !afterCoverage.coverageFresh ||
    afterCoverage.missingServices.length > 0
  ) {
    throw new Error('saas_isolation_post_runtime_gate_coverage_missing');
  }

  return {
    status: afterCoverage.status,
    activeExplained: afterCoverage.active.explained,
  };
}

export function createSaasIsolationPostRuntimeGateDeps(
  service: Pick<SaasIsolationPostRuntimeGateDeps, 'readHealth' | 'recordCoverage'>,
): SaasIsolationPostRuntimeGateDeps {
  return {
    ...service,
    now: () => new Date(),
    randomId: randomUUID,
  };
}
