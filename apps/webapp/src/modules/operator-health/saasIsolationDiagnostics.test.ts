import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SAAS_ISOLATION_REQUIRED_SERVICES,
  buildSaasIsolationHealthPayload,
  createSaasIsolationDiagnosticsService,
  emptySaasIsolationTrend,
  validateSaasIsolationCoverageInput,
  validateSaasIsolationTrend,
  type SaasIsolationDiagnosticsPort,
  type SaasIsolationEventAggregate,
  type RecordSaasIsolationCoverageInput,
} from "./saasIsolationDiagnostics";
import { createBestEffortSaasIsolationReporter } from "@/infra/saasIsolationReporterRuntime";
import { classifyPostgresIsolationDenial } from "@/infra/db/saasIsolationDbFailureReporting";
import { createSaasIsolationBackgroundReporter } from "@bersoncare/db-principal";
import { inMemorySaasIsolationDiagnosticsPort } from "@/infra/repos/inMemorySaasIsolationDiagnostics";
import { parseSaasIsolationDiagnosticsCommand } from "../../../scripts/report-saas-isolation-diagnostics";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const RUN_ID = "11111111-1111-4111-8111-111111111111";
function coverage(overrides: Partial<RecordSaasIsolationCoverageInput> = {}): RecordSaasIsolationCoverageInput {
  return {
    id: RUN_ID,
    status: "complete",
    startedAt: "2026-07-15T10:00:00.000Z",
    finishedAt: "2026-07-15T11:00:00.000Z",
    servicesChecked: [...SAAS_ISOLATION_REQUIRED_SERVICES],
    checksCount: 12,
    unexpectedErrorsCount: 0,
    ...overrides,
  };
}
function event(overrides: Partial<SaasIsolationEventAggregate> = {}): SaasIsolationEventAggregate {
  return {
    eventClass: "missing_principal",
    sourceService: "webapp",
    sourceOperation: "webapp_db_request",
    explanationStatus: "unexplained",
    lifecycleStatus: "active",
    occurrenceCount: 1,
    firstSeenAt: "2026-07-15T10:00:00.000Z",
    lastSeenAt: "2026-07-15T11:00:00.000Z",
    ...overrides,
  };
}

function trend(overrides: Partial<{ current24Hours: number; previous24Hours: number }> = {}) {
  return {
    asOf: new Date(NOW).toISOString(),
    current24Hours: 4,
    previous24Hours: 2,
    daily7Days: emptySaasIsolationTrend(NOW).daily7Days,
    ...overrides,
  };
}

describe("E1 SaaS isolation diagnostics contract", () => {
  it("exposes distinct okay, stale, incomplete and critical states with reasons", () => {
    expect(buildSaasIsolationHealthPayload([], coverage(), NOW).status).toBe("okay");
    const stale = buildSaasIsolationHealthPayload([], coverage({
      startedAt: "2026-07-12T10:00:00.000Z",
      finishedAt: "2026-07-12T11:00:00.000Z",
    }), NOW);
    expect(stale).toMatchObject({ status: "stale", statusReasons: ["coverage_stale"] });
    const incomplete = buildSaasIsolationHealthPayload([], coverage({ status: "incomplete", servicesChecked: ["webapp"], checksCount: 1 }), NOW);
    expect(incomplete.status).toBe("incomplete");
    expect(incomplete.statusReasons).toContain("coverage_services_missing");
    const critical = buildSaasIsolationHealthPayload([event()], coverage(), NOW);
    expect(critical.status).toBe("critical");
    expect(critical.statusReasons).toContain("active_unexplained_event");
    expect(buildSaasIsolationHealthPayload([], coverage({ status: "failed" }), NOW).status).toBe("critical");
  });

  it("keeps lifecycle and explanation axes independent with explicit aggregation semantics", () => {
    const payload = buildSaasIsolationHealthPayload([
      event(),
      event({ lifecycleStatus: "resolved", explanationStatus: "explained", occurrenceCount: 3 }),
      event({ eventClass: "cleanup_failure", explanationStatus: "explained" }),
    ], coverage(), NOW);
    expect(payload.active).toEqual({ unexplained: 1, explained: 1, occurrences: 2 });
    expect(payload.resolved).toEqual({ unexplained: 0, explained: 1, occurrences: 3 });
  });

  it("validates a bounded seven-day trend and computes the rolling 24h delta", () => {
    expect(validateSaasIsolationTrend(trend())).toMatchObject({
      asOf: "2026-07-15T12:00:00.000Z",
      current24Hours: 4,
      previous24Hours: 2,
      delta: 2,
    });
    expect(buildSaasIsolationHealthPayload([], coverage(), NOW, trend()).trend.daily7Days).toHaveLength(7);
    expect(() => validateSaasIsolationTrend({ ...trend(), rawSql: "select secret" }))
      .toThrow("unsafe_saas_isolation_trend");
    expect(() => validateSaasIsolationTrend({ ...trend(), daily7Days: [] }))
      .toThrow("invalid_saas_isolation_daily_trend");
    expect(() => validateSaasIsolationTrend({
      ...trend(),
      asOf: "2026-07-16T00:00:00.000Z",
    })).toThrow("invalid_saas_isolation_daily_window");
  });

  it("parses only the closed reversible TEST diagnostics scenarios", () => {
    expect(parseSaasIsolationDiagnosticsCommand(["scenario", "--state", "critical"]))
      .toEqual({ kind: "scenario", state: "critical" });
    expect(() => parseSaasIsolationDiagnosticsCommand(["scenario", "--state", "prod-reset"]))
      .toThrow("invalid_test_scenario");
  });

  it("refuses empty or partial coverage claiming complete", () => {
    expect(() => validateSaasIsolationCoverageInput(coverage({ servicesChecked: [], checksCount: 0 })))
      .toThrow("invalid_saas_isolation_complete_coverage");
    expect(() => validateSaasIsolationCoverageInput(coverage({ servicesChecked: ["webapp"], checksCount: 20 })))
      .toThrow("invalid_saas_isolation_complete_coverage");
  });

  it("rejects unsafe event input and unsafe persisted rows before UI/API use", async () => {
    const port: SaasIsolationDiagnosticsPort = {
      recordEvent: vi.fn(),
      recordCoverageAndResolve: vi.fn(),
      listEventAggregates: vi.fn(async () => [{ ...event(), sourceOperation: "GET /patients/secret" }]),
      getLastCoverageRun: vi.fn(async () => coverage()),
      getTrend: vi.fn(async () => trend()),
    };
    const service = createSaasIsolationDiagnosticsService(port);
    for (const unsafeKey of ["rawSql", "payload", "signature", "organizationId", "patientId", "userId"]) {
      expect(() => service.report({
        eventClass: "rls_denial",
        sourceService: "webapp",
        sourceOperation: "webapp_db_request",
        [unsafeKey]: "secret-value",
      } as never)).toThrow("unsafe_saas_isolation_event");
    }
    await expect(service.readHealth()).rejects.toThrow("invalid_saas_isolation_operation");
  });

  it("records coverage through one atomic port operation", async () => {
    const recordCoverageAndResolve = vi.fn();
    const port: SaasIsolationDiagnosticsPort = {
      recordEvent: vi.fn(), recordCoverageAndResolve,
      listEventAggregates: vi.fn(async () => []), getLastCoverageRun: vi.fn(async () => null),
      getTrend: vi.fn(async () => trend()),
    };
    await createSaasIsolationDiagnosticsService(port).recordCoverage(coverage());
    expect(recordCoverageAndResolve).toHaveBeenCalledTimes(1);
  });

  it("accepts an exact coverage retry and rejects a conflicting retry with the same UUID", async () => {
    const service = createSaasIsolationDiagnosticsService(inMemorySaasIsolationDiagnosticsPort);
    const input = coverage({ id: "33333333-3333-4333-8333-333333333333" });
    await service.recordCoverage(input);
    await expect(service.recordCoverage(input)).resolves.toBeUndefined();
    await expect(service.recordCoverage({ ...input, checksCount: input.checksCount + 1 }))
      .rejects.toThrow("saas_isolation_coverage_id_conflict");
  });

  it("distinguishes RLS policy denial from missing table grants", () => {
    expect(classifyPostgresIsolationDenial(Object.assign(new Error("row violates row-level security policy"), { code: "42501" }))).toBe("rls_denial");
    expect(classifyPostgresIsolationDenial(Object.assign(new Error("permission denied for table patients"), { code: "42501" }))).toBe("role_pool_mismatch");
  });

  it("enqueues telemetry without waiting and bounds failure storms", async () => {
    let rejectWrite: ((reason?: unknown) => void) | undefined;
    const writer = vi.fn(() => new Promise<void>((_, reject) => { rejectWrite = reject; }));
    const reporter = createBestEffortSaasIsolationReporter(writer);
    const input = { eventClass: "cleanup_failure" as const, sourceService: "webapp" as const, sourceOperation: "webapp_db_request" as const };
    reporter.report(input);
    for (let index = 0; index < 100; index += 1) reporter.report(input);
    expect(writer).toHaveBeenCalledTimes(1);
    expect(reporter.inspectForTest().queueLength).toBeLessThanOrEqual(64);
    rejectWrite?.(new Error("db down"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reporter.inspectForTest().queueLength).toBe(0);
  });

  it("does not classify ordinary background business failures as isolation events", async () => {
    const query = vi.fn(async (_sql: string, _values: readonly unknown[]) => undefined);
    const reporter = createSaasIsolationBackgroundReporter({
      source: { service: "worker", operation: "worker_queue_drain" },
      query,
    });
    reporter(new Error("external delivery provider timeout"));
    await Promise.resolve();
    expect(query).not.toHaveBeenCalled();
    reporter(Object.assign(new Error("permission denied for table private_rows"), { code: "42501" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toEqual([
      "role_pool_mismatch", "worker", "worker_queue_drain", "unexplained",
    ]);
  });

  it("fault-injects all six closed classes exactly once without persisting raw errors", async () => {
    const query = vi.fn(async (_sql: string, _values: readonly unknown[]) => undefined);
    const reporter = createSaasIsolationBackgroundReporter({
      source: { service: "worker", operation: "worker_queue_drain" },
      query,
    });
    const injected = [
      new Error("principal context is required"),
      new Error("install_signed_context signature rejected"),
      Object.assign(new Error("permission denied for table private_rows"), { code: "42501" }),
      Object.assign(new Error("row violates row-level security policy"), { code: "42501" }),
      new Error("release_principal_context cleanup failed"),
      Object.assign(new Error("opaque database authorization rejection"), { code: "42501" }),
    ];
    for (const error of injected) reporter(error);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls.map((call) => call[1]?.[0])).toEqual([
      "missing_principal",
      "invalid_signature_or_install",
      "role_pool_mismatch",
      "rls_denial",
      "cleanup_failure",
      "unclassified_background_operation",
    ]);
    for (const call of query.mock.calls) {
      expect(call[1]).toHaveLength(4);
      expect(JSON.stringify(call[1])).not.toMatch(/private_rows|signature rejected/);
    }
  });

  it("migration and privilege overlay are closed and least-privilege", async () => {
    const migration = await readFile(join(process.cwd(), "db/drizzle-migrations/0185_saas_isolation_diagnostics.sql"), "utf8");
    const overlay = await readFile(join(process.cwd(), "../../deploy/postgres/saas-isolation-telemetry.sql"), "utf8");
    for (const forbidden of ['"organization_id"', '"user_id"', '"patient_id"', '"payload"', '"signature"']) {
      expect(migration).not.toContain(forbidden);
    }
    expect(migration).toContain("saas_isolation_events_source_operation_check");
    expect(overlay).toContain("CREATE ROLE saas_telemetry_owner NOLOGIN");
    expect(overlay).toContain("SECURITY DEFINER");
    expect(overlay).toContain("REVOKE ALL ON TABLE");
    expect(overlay).toContain("telemetry_least_privilege_verified");
    expect(overlay).toContain("saas_isolation_coverage_id_conflict");
    expect(overlay).toContain("NOT has_function_privilege(:'telemetry_webapp_runtime_role', 'app.read_saas_isolation_events()'");
  });
});
