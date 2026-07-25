#!/usr/bin/env tsx
import { and, eq, inArray, isNull, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { DrizzleDb } from "@/app-layer/db/drizzle";
import { platformUsers } from "../../db/schema";
import {
  assertFioApplyTarget,
  buildManifest,
  parseAndVerifyManifest,
  summarizePlan,
  type CurrentFioRow,
  type FioIdentityState,
  type FioNameState,
  type FioReviewEnvironment,
} from "./owner-reviewed-fio-contract";
import {
  applyOwnerReviewedFio,
  createDurableRollbackWriter,
  previewOwnerReviewedFio,
  readRegularJsonFile,
  readRollbackArtifact,
  rollbackOwnerReviewedFio,
  sealManifestFile,
  type FioDatabasePort,
  type FioTransactionPort,
} from "./owner-reviewed-fio-operation";

type Command = "hash" | "seal" | "verify" | "preview" | "apply" | "rollback";
type DrizzleTransaction = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0];
type DbReader = DrizzleDb | DrizzleTransaction;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredOption(name: string): string {
  const value = option(name);
  if (!value || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parseCommand(): Command {
  const command = process.argv[2];
  if (
    command === "hash" ||
    command === "seal" ||
    command === "verify" ||
    command === "preview" ||
    command === "apply" ||
    command === "rollback"
  ) {
    return command;
  }
  throw new Error("command must be hash, seal, verify, preview, apply, or rollback");
}

async function readJson(pathname: string): Promise<unknown> {
  return readRegularJsonFile(pathname);
}

function nullableCondition(column: SQLWrapper, value: string | null): SQL {
  return value === null ? isNull(column) : eq(column, value);
}

function identityConditions(id: string, expected: FioIdentityState): SQL[] {
  return [
    eq(platformUsers.id, id),
    eq(platformUsers.displayName, expected.displayName),
    nullableCondition(platformUsers.firstName, expected.firstName),
    nullableCondition(platformUsers.lastName, expected.lastName),
    nullableCondition(platformUsers.patronymic, expected.patronymic),
    nullableCondition(platformUsers.mergedIntoId, expected.mergedIntoId),
  ];
}

async function readRows(db: DbReader, ids: string[], lock: boolean): Promise<CurrentFioRow[]> {
  if (ids.length === 0) return [];
  const query = db
    .select({
      id: platformUsers.id,
      displayName: platformUsers.displayName,
      firstName: platformUsers.firstName,
      lastName: platformUsers.lastName,
      patronymic: platformUsers.patronymic,
      mergedIntoId: platformUsers.mergedIntoId,
    })
    .from(platformUsers)
    .where(inArray(platformUsers.id, ids));
  return lock ? query.for("update") : query;
}

async function conditionalUpdate(
  tx: DrizzleTransaction,
  id: string,
  expected: FioIdentityState,
  desired: FioNameState,
): Promise<boolean> {
  const changed = await tx
    .update(platformUsers)
    .set({ ...desired, updatedAt: new Date().toISOString() })
    .where(and(...identityConditions(id, expected)))
    .returning({ id: platformUsers.id });
  return changed.length === 1;
}

function buildDbPort(db: DrizzleDb): FioDatabasePort {
  return {
    readRows: (ids) => readRows(db, ids, false),
    transaction: (run) =>
      db.transaction(async (tx) => {
        const port: FioTransactionPort = {
          lockRows: (ids) => readRows(tx, ids, true),
          conditionalUpdate: (id, expected, desired) => conditionalUpdate(tx, id, expected, desired),
        };
        return run(port);
      }),
  };
}

async function readLiveDatabaseName(db: DrizzleDb): Promise<string> {
  const result = await db.execute<{ database_name: string }>(sql`SELECT current_database()::text AS database_name`);
  return result.rows[0]?.database_name ?? "";
}

/**
 * B-8 (owner 2026-07-25): resolves the apply target. Default = the historical TEST-only gate; the
 * cutover target needs BOTH `--allow-authorized-prod-target` and an exact
 * `--authorized-prod-database=<name>` match, and a manifest whose environment agrees.
 */
function targetOptions() {
  return {
    explicitTest: hasFlag("--test"),
    allowAuthorizedProdTarget: hasFlag("--allow-authorized-prod-target"),
    authorizedProdDatabase: option("--authorized-prod-database"),
  };
}

async function verifyLiveApplyTarget(
  db: DrizzleDb,
  manifestEnvironment: FioReviewEnvironment,
): Promise<{ environment: FioReviewEnvironment; databaseName: string }> {
  const databaseName = await readLiveDatabaseName(db);
  const environment = assertFioApplyTarget(
    process.env.DATABASE_URL,
    databaseName,
    manifestEnvironment,
    targetOptions(),
  );
  return { environment, databaseName };
}

function confirmExact(actual: string, optionName: string): void {
  const confirmed = requiredOption(optionName);
  if (confirmed !== actual) throw new Error(`${optionName} does not match the verified artifact`);
}

async function main(): Promise<void> {
  const command = parseCommand();
  if (command === "hash") {
    const manifest = buildManifest(await readJson(requiredOption("--manifest")));
    console.log(JSON.stringify({ manifestSha256: manifest.manifestSha256 }));
    return;
  }
  if (command === "seal") {
    const manifest = await sealManifestFile(
      await readJson(requiredOption("--manifest")),
      requiredOption("--output"),
    );
    console.log(
      JSON.stringify({
        command,
        manifestSha256: manifest.manifestSha256,
        reviewSourceSha256: manifest.reviewSourceSha256,
      }),
    );
    return;
  }
  if (command === "verify") {
    const manifest = parseAndVerifyManifest(await readJson(requiredOption("--manifest")));
    confirmExact(manifest.manifestSha256, "--confirm-manifest-sha256");
    confirmExact(manifest.reviewSourceSha256, "--confirm-review-source-sha256");
    console.log(
      JSON.stringify({
        command,
        verified: true,
        rows: manifest.rows.length,
        manifestSha256: manifest.manifestSha256,
        reviewSourceSha256: manifest.reviewSourceSha256,
      }),
    );
    return;
  }

  const { getDrizzle } = await import("@/app-layer/db/drizzle");
  const db = getDrizzle();
  const dbPort = buildDbPort(db);

  if (command === "rollback") {
    const artifact = await readRollbackArtifact(requiredOption("--artifact"));
    confirmExact(artifact.artifactSha256, "--confirm-artifact-sha256");
    // Gate on the artifact's own (hashed) environment, then additionally require the live database to be
    // the exact one the artifact was produced against — a rollback must never land on a different DB.
    const { environment, databaseName } = await verifyLiveApplyTarget(db, artifact.environment);
    if (artifact.targetDatabase !== databaseName) {
      throw new Error("rollback artifact targetDatabase does not match current_database()");
    }
    const rolledBack = await rollbackOwnerReviewedFio(artifact, dbPort);
    console.log(JSON.stringify({ command, target: environment, rolledBack }));
    return;
  }

  const manifest = parseAndVerifyManifest(await readJson(requiredOption("--manifest")));
  const { environment, databaseName } = await verifyLiveApplyTarget(db, manifest.environment);

  if (command === "preview") {
    const plan = await previewOwnerReviewedFio(manifest, dbPort);
    console.log(
      JSON.stringify({ command, target: environment, manifestSha256: manifest.manifestSha256, ...summarizePlan(plan) }),
    );
    return;
  }

  confirmExact(manifest.manifestSha256, "--confirm-manifest-sha256");
  confirmExact(manifest.reviewSourceSha256, "--confirm-review-source-sha256");
  const result = await applyOwnerReviewedFio(
    manifest,
    dbPort,
    createDurableRollbackWriter(requiredOption("--rollback-dir")),
    undefined,
    databaseName,
  );
  console.log(
    JSON.stringify({
      command,
      target: environment,
      ...summarizePlan(result.plan),
      artifactCreated: result.artifactPath !== null,
      artifactSha256: result.artifactSha256,
    }),
  );
}

main().catch((error: unknown) => {
  void error;
  console.error(JSON.stringify({ ok: false, error: "fio_owner_review_operation_failed" }));
  process.exitCode = 1;
});
