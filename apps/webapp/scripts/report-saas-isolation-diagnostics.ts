import { pathToFileURL } from "node:url";
import {
  SAAS_ISOLATION_EVENT_CLASSES,
  SAAS_ISOLATION_SOURCE_OPERATIONS,
  SAAS_ISOLATION_SOURCE_SERVICES,
  type RecordSaasIsolationCoverageInput,
  type ReportSaasIsolationEventInput,
} from "../src/modules/operator-health/saasIsolationDiagnostics";
import { runtimeSaasIsolationDiagnostics } from "../src/infra/saasIsolationReporterRuntime";
import { getSaasIsolationOperatorPool } from "../src/infra/db/saasIsolationTelemetry";

const TEST_SCENARIOS = ["clean", "okay", "incomplete", "critical"] as const;
type TestScenario = (typeof TEST_SCENARIOS)[number];

type Command =
  | { kind: "event"; input: ReportSaasIsolationEventInput }
  | { kind: "coverage"; input: RecordSaasIsolationCoverageInput }
  | { kind: "scenario"; state: TestScenario }
  | { kind: "read" };

function option(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`missing_${name.slice(2).replaceAll("-", "_")}`);
  return value;
}

function enumValue<T extends string>(values: readonly T[], value: string, errorCode: string): T {
  const match = values.find((item) => item === value);
  if (!match) throw new Error(errorCode);
  return match;
}

function nonNegativeInt(value: string, errorCode: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(errorCode);
  return parsed;
}

function iso(value: string, errorCode: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error(errorCode);
  return value;
}

function uuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("invalid_id");
  }
  return value;
}

export function parseSaasIsolationDiagnosticsCommand(args: string[]): Command {
  const command = args[0];
  if (command === "read") return { kind: "read" };
  if (command === "scenario") {
    return {
      kind: "scenario",
      state: enumValue(TEST_SCENARIOS, option(args, "--state"), "invalid_test_scenario"),
    };
  }
  if (command === "event") {
    return {
      kind: "event",
      input: {
        eventClass: enumValue(SAAS_ISOLATION_EVENT_CLASSES, option(args, "--class"), "invalid_event_class"),
        sourceService: enumValue(SAAS_ISOLATION_SOURCE_SERVICES, option(args, "--service"), "invalid_service"),
        sourceOperation: enumValue(
          SAAS_ISOLATION_SOURCE_OPERATIONS,
          option(args, "--operation"),
          "invalid_operation",
        ),
        explanationStatus: args.includes("--explained") ? "explained" : "unexplained",
      },
    };
  }
  if (command === "coverage") {
    const services = option(args, "--services")
      .split(",")
      .map((value) => enumValue(SAAS_ISOLATION_SOURCE_SERVICES, value, "invalid_service"));
    const status = option(args, "--status");
    if (status !== "complete" && status !== "incomplete" && status !== "failed") {
      throw new Error("invalid_coverage_status");
    }
    return {
      kind: "coverage",
      input: {
        id: uuid(option(args, "--id")),
        status,
        startedAt: iso(option(args, "--started-at"), "invalid_started_at"),
        finishedAt: iso(option(args, "--finished-at"), "invalid_finished_at"),
        servicesChecked: services,
        checksCount: nonNegativeInt(option(args, "--checks"), "invalid_checks"),
        unexpectedErrorsCount: nonNegativeInt(option(args, "--unexpected"), "invalid_unexpected"),
      },
    };
  }
  throw new Error("usage: event|coverage|scenario|read");
}

async function main(): Promise<void> {
  const command = parseSaasIsolationDiagnosticsCommand(process.argv.slice(2));
  if (command.kind === "event") {
    await runtimeSaasIsolationDiagnostics.report(command.input);
    process.stdout.write("recorded\n");
    return;
  }
  if (command.kind === "coverage") {
    await runtimeSaasIsolationDiagnostics.recordCoverage(command.input);
    process.stdout.write("coverage_recorded\n");
    return;
  }
  if (command.kind === "scenario") {
    await getSaasIsolationOperatorPool().query(
      "SELECT app.set_saas_isolation_test_scenario($1)",
      [command.state],
    );
    process.stdout.write(`scenario_${command.state}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await runtimeSaasIsolationDiagnostics.readHealth(), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    const code = error instanceof Error ? error.message : "diagnostics_command_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
