import { createHash } from "node:crypto";

export const OWNER_REVIEWED_FIO_SCHEMA = "bersoncare.fio-owner-review.test/v1" as const;
export const OWNER_REVIEWED_FIO_ROLLBACK_SCHEMA = "bersoncare.fio-owner-review.test-rollback/v1" as const;

export type FioNameState = {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  patronymic: string | null;
};

export type FioIdentityState = FioNameState & {
  mergedIntoId: string | null;
};

export type OwnerReviewedFioManifestRow = {
  id: string;
  expectedBefore: FioIdentityState;
  desiredAfter: FioNameState;
};

export type OwnerReviewedFioManifestPayload = {
  schemaVersion: typeof OWNER_REVIEWED_FIO_SCHEMA;
  environment: "TEST";
  runId: string;
  createdAt: string;
  reviewSourceSha256: string;
  approval: {
    decision: "approved_for_test";
    approvedAt: string;
    reference: string;
  };
  exceptions: {
    expectedMissing: Array<{ id: string; reference: string }>;
    preserveCurrent: Array<{ id: string; exactCurrent: FioIdentityState; reference: string }>;
  };
  rows: OwnerReviewedFioManifestRow[];
};

export type OwnerReviewedFioManifest = OwnerReviewedFioManifestPayload & {
  manifestSha256: string;
};

export type OwnerReviewedFioRollbackRow = {
  id: string;
  restoreBefore: FioIdentityState;
  expectedPostApply: FioIdentityState;
};

export type OwnerReviewedFioRollbackPayload = {
  schemaVersion: typeof OWNER_REVIEWED_FIO_ROLLBACK_SCHEMA;
  environment: "TEST";
  runId: string;
  createdAt: string;
  sourceManifestSha256: string;
  sourceReviewSha256: string;
  targetDatabase: "bersoncarebot_test";
  rows: OwnerReviewedFioRollbackRow[];
};

export type OwnerReviewedFioRollbackArtifact = OwnerReviewedFioRollbackPayload & {
  artifactSha256: string;
};

export type CurrentFioRow = FioIdentityState & { id: string };

export type FioPlan = {
  updates: Array<{ manifest: OwnerReviewedFioManifestRow; current: CurrentFioRow }>;
  alreadyMatched: OwnerReviewedFioManifestRow[];
  expectedMissing: OwnerReviewedFioManifestRow[];
  preservedCurrent: Array<{ manifest: OwnerReviewedFioManifestRow; current: CurrentFioRow }>;
  unexpectedMissing: OwnerReviewedFioManifestRow[];
  unexpectedDrift: Array<{ manifest: OwnerReviewedFioManifestRow; current: CurrentFioRow | null }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unsupported or missing fields`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  if (value.length === 0) throw new Error(`${label} must not be empty`);
}

function assertNullableString(value: unknown, label: string): asserts value is string | null {
  if (value !== null && typeof value !== "string") throw new Error(`${label} must be a string or null`);
}

function assertIsoTimestamp(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
}

function assertUuid(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a UUID`);
}

function assertSha256(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  if (!SHA256_PATTERN.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hash`);
}

function parseNameState(value: unknown, label: string): FioNameState {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  assertExactKeys(value, ["displayName", "firstName", "lastName", "patronymic"], label);
  assertString(value.displayName, `${label}.displayName`);
  assertNullableString(value.firstName, `${label}.firstName`);
  assertNullableString(value.lastName, `${label}.lastName`);
  assertNullableString(value.patronymic, `${label}.patronymic`);
  return {
    displayName: value.displayName,
    firstName: value.firstName,
    lastName: value.lastName,
    patronymic: value.patronymic,
  };
}

function parseIdentityState(value: unknown, label: string): FioIdentityState {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  assertExactKeys(value, ["displayName", "firstName", "lastName", "patronymic", "mergedIntoId"], label);
  const names = parseNameState(
    {
      displayName: value.displayName,
      firstName: value.firstName,
      lastName: value.lastName,
      patronymic: value.patronymic,
    },
    label,
  );
  assertNullableString(value.mergedIntoId, `${label}.mergedIntoId`);
  if (value.mergedIntoId !== null) assertUuid(value.mergedIntoId, `${label}.mergedIntoId`);
  return { ...names, mergedIntoId: value.mergedIntoId };
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON does not allow non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("canonical JSON contains an unsupported value");
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function parseManifestPayload(value: unknown): OwnerReviewedFioManifestPayload {
  if (!isRecord(value)) throw new Error("manifest must be an object");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "environment",
      "runId",
      "createdAt",
      "reviewSourceSha256",
      "approval",
      "exceptions",
      "rows",
    ],
    "manifest payload",
  );
  if (value.schemaVersion !== OWNER_REVIEWED_FIO_SCHEMA) throw new Error("unsupported manifest schemaVersion");
  if (value.environment !== "TEST") throw new Error("manifest environment must be TEST");
  assertUuid(value.runId, "manifest.runId");
  assertIsoTimestamp(value.createdAt, "manifest.createdAt");
  assertSha256(value.reviewSourceSha256, "manifest.reviewSourceSha256");

  if (!isRecord(value.approval)) throw new Error("manifest.approval must be an object");
  assertExactKeys(value.approval, ["decision", "approvedAt", "reference"], "manifest.approval");
  if (value.approval.decision !== "approved_for_test") throw new Error("manifest approval is not for TEST");
  assertIsoTimestamp(value.approval.approvedAt, "manifest.approval.approvedAt");
  assertNonEmptyString(value.approval.reference, "manifest.approval.reference");

  if (!Array.isArray(value.rows) || value.rows.length === 0) throw new Error("manifest.rows must be non-empty");
  const ids = new Set<string>();
  const rows = value.rows.map((rawRow, index): OwnerReviewedFioManifestRow => {
    const label = `manifest.rows[${index}]`;
    if (!isRecord(rawRow)) throw new Error(`${label} must be an object`);
    assertExactKeys(rawRow, ["id", "expectedBefore", "desiredAfter"], label);
    assertUuid(rawRow.id, `${label}.id`);
    if (ids.has(rawRow.id)) throw new Error("manifest contains duplicate IDs");
    ids.add(rawRow.id);
    return {
      id: rawRow.id,
      expectedBefore: parseIdentityState(rawRow.expectedBefore, `${label}.expectedBefore`),
      desiredAfter: parseNameState(rawRow.desiredAfter, `${label}.desiredAfter`),
    };
  });

  if (!isRecord(value.exceptions)) throw new Error("manifest.exceptions must be an object");
  assertExactKeys(value.exceptions, ["expectedMissing", "preserveCurrent"], "manifest.exceptions");
  if (!Array.isArray(value.exceptions.expectedMissing) || !Array.isArray(value.exceptions.preserveCurrent)) {
    throw new Error("manifest exception lists must be arrays");
  }
  const rowIds = new Set(rows.map((row) => row.id));
  const exceptionIds = new Set<string>();
  const expectedMissing = value.exceptions.expectedMissing.map((rawException, index) => {
    const label = `manifest.exceptions.expectedMissing[${index}]`;
    if (!isRecord(rawException)) throw new Error(`${label} must be an object`);
    assertExactKeys(rawException, ["id", "reference"], label);
    assertUuid(rawException.id, `${label}.id`);
    assertNonEmptyString(rawException.reference, `${label}.reference`);
    if (!rowIds.has(rawException.id)) throw new Error("manifest exception ID must exist in rows");
    if (exceptionIds.has(rawException.id)) throw new Error("manifest contains duplicate exception IDs");
    exceptionIds.add(rawException.id);
    return { id: rawException.id, reference: rawException.reference };
  });
  const preserveCurrent = value.exceptions.preserveCurrent.map((rawException, index) => {
    const label = `manifest.exceptions.preserveCurrent[${index}]`;
    if (!isRecord(rawException)) throw new Error(`${label} must be an object`);
    assertExactKeys(rawException, ["id", "exactCurrent", "reference"], label);
    assertUuid(rawException.id, `${label}.id`);
    assertNonEmptyString(rawException.reference, `${label}.reference`);
    if (!rowIds.has(rawException.id)) throw new Error("manifest exception ID must exist in rows");
    if (exceptionIds.has(rawException.id)) throw new Error("manifest contains duplicate exception IDs");
    exceptionIds.add(rawException.id);
    const exactCurrent = parseIdentityState(rawException.exactCurrent, `${label}.exactCurrent`);
    const row = rows.find((candidate) => candidate.id === rawException.id)!;
    if (sameIdentityState(exactCurrent, row.expectedBefore)) {
      throw new Error("preserve-current exception must differ from expectedBefore");
    }
    if (sameNameState(exactCurrent, row.desiredAfter) && exactCurrent.mergedIntoId === row.expectedBefore.mergedIntoId) {
      throw new Error("preserve-current exception must differ from desiredAfter");
    }
    return { id: rawException.id, exactCurrent, reference: rawException.reference };
  });

  return {
    schemaVersion: OWNER_REVIEWED_FIO_SCHEMA,
    environment: "TEST",
    runId: value.runId,
    createdAt: value.createdAt,
    reviewSourceSha256: value.reviewSourceSha256,
    approval: {
      decision: "approved_for_test",
      approvedAt: value.approval.approvedAt,
      reference: value.approval.reference,
    },
    exceptions: { expectedMissing, preserveCurrent },
    rows,
  };
}

export function parseAndVerifyManifest(value: unknown): OwnerReviewedFioManifest {
  if (!isRecord(value)) throw new Error("manifest must be an object");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "environment",
      "runId",
      "createdAt",
      "reviewSourceSha256",
      "approval",
      "exceptions",
      "rows",
      "manifestSha256",
    ],
    "manifest",
  );
  assertSha256(value.manifestSha256, "manifest.manifestSha256");
  const { manifestSha256, ...rawPayload } = value;
  const payload = parseManifestPayload(rawPayload);
  const computed = sha256Canonical(payload);
  if (computed !== manifestSha256) throw new Error("manifest SHA-256 mismatch");
  return { ...payload, manifestSha256 };
}

export function buildManifest(value: unknown): OwnerReviewedFioManifest {
  const payload = parseManifestPayload(value);
  return { ...payload, manifestSha256: sha256Canonical(payload) };
}

export function buildRollbackArtifact(
  manifest: OwnerReviewedFioManifest,
  updates: FioPlan["updates"],
  createdAt: string,
): OwnerReviewedFioRollbackArtifact {
  const payload: OwnerReviewedFioRollbackPayload = {
    schemaVersion: OWNER_REVIEWED_FIO_ROLLBACK_SCHEMA,
    environment: "TEST",
    runId: manifest.runId,
    createdAt,
    sourceManifestSha256: manifest.manifestSha256,
    sourceReviewSha256: manifest.reviewSourceSha256,
    targetDatabase: "bersoncarebot_test",
    rows: updates.map(({ manifest: row, current }) => ({
      id: row.id,
      restoreBefore: {
        displayName: current.displayName,
        firstName: current.firstName,
        lastName: current.lastName,
        patronymic: current.patronymic,
        mergedIntoId: current.mergedIntoId,
      },
      expectedPostApply: { ...row.desiredAfter, mergedIntoId: current.mergedIntoId },
    })),
  };
  return { ...payload, artifactSha256: sha256Canonical(payload) };
}

export function parseAndVerifyRollbackArtifact(value: unknown): OwnerReviewedFioRollbackArtifact {
  if (!isRecord(value)) throw new Error("rollback artifact must be an object");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "environment",
      "runId",
      "createdAt",
      "sourceManifestSha256",
      "sourceReviewSha256",
      "targetDatabase",
      "rows",
      "artifactSha256",
    ],
    "rollback artifact",
  );
  if (value.schemaVersion !== OWNER_REVIEWED_FIO_ROLLBACK_SCHEMA) throw new Error("unsupported rollback schema");
  if (value.environment !== "TEST" || value.targetDatabase !== "bersoncarebot_test") {
    throw new Error("rollback artifact is not for bersoncarebot_test");
  }
  assertUuid(value.runId, "rollback.runId");
  assertIsoTimestamp(value.createdAt, "rollback.createdAt");
  assertSha256(value.sourceManifestSha256, "rollback.sourceManifestSha256");
  assertSha256(value.sourceReviewSha256, "rollback.sourceReviewSha256");
  assertSha256(value.artifactSha256, "rollback.artifactSha256");
  if (!Array.isArray(value.rows) || value.rows.length === 0) throw new Error("rollback.rows must be non-empty");
  const ids = new Set<string>();
  const rows = value.rows.map((rawRow, index): OwnerReviewedFioRollbackRow => {
    const label = `rollback.rows[${index}]`;
    if (!isRecord(rawRow)) throw new Error(`${label} must be an object`);
    assertExactKeys(rawRow, ["id", "restoreBefore", "expectedPostApply"], label);
    assertUuid(rawRow.id, `${label}.id`);
    if (ids.has(rawRow.id)) throw new Error("rollback artifact contains duplicate IDs");
    ids.add(rawRow.id);
    return {
      id: rawRow.id,
      restoreBefore: parseIdentityState(rawRow.restoreBefore, `${label}.restoreBefore`),
      expectedPostApply: parseIdentityState(rawRow.expectedPostApply, `${label}.expectedPostApply`),
    };
  });
  const payload: OwnerReviewedFioRollbackPayload = {
    schemaVersion: OWNER_REVIEWED_FIO_ROLLBACK_SCHEMA,
    environment: "TEST",
    runId: value.runId,
    createdAt: value.createdAt,
    sourceManifestSha256: value.sourceManifestSha256,
    sourceReviewSha256: value.sourceReviewSha256,
    targetDatabase: "bersoncarebot_test",
    rows,
  };
  if (sha256Canonical(payload) !== value.artifactSha256) throw new Error("rollback artifact SHA-256 mismatch");
  return { ...payload, artifactSha256: value.artifactSha256 };
}

export function sameNameState(left: FioNameState, right: FioNameState): boolean {
  return (
    left.displayName === right.displayName &&
    left.firstName === right.firstName &&
    left.lastName === right.lastName &&
    left.patronymic === right.patronymic
  );
}

export function sameIdentityState(left: FioIdentityState, right: FioIdentityState): boolean {
  return sameNameState(left, right) && left.mergedIntoId === right.mergedIntoId;
}

export function planManifest(manifest: OwnerReviewedFioManifest, currentRows: CurrentFioRow[]): FioPlan {
  const byId = new Map(currentRows.map((row) => [row.id, row]));
  const expectedMissingIds = new Set(manifest.exceptions.expectedMissing.map((item) => item.id));
  const preserveById = new Map(manifest.exceptions.preserveCurrent.map((item) => [item.id, item.exactCurrent]));
  const plan: FioPlan = {
    updates: [],
    alreadyMatched: [],
    expectedMissing: [],
    preservedCurrent: [],
    unexpectedMissing: [],
    unexpectedDrift: [],
  };
  for (const row of manifest.rows) {
    const current = byId.get(row.id);
    if (expectedMissingIds.has(row.id)) {
      if (!current) plan.expectedMissing.push(row);
      else plan.unexpectedDrift.push({ manifest: row, current });
      continue;
    }
    const preserved = preserveById.get(row.id);
    if (preserved) {
      if (current && sameIdentityState(current, preserved)) plan.preservedCurrent.push({ manifest: row, current });
      else if (!current) plan.unexpectedMissing.push(row);
      else plan.unexpectedDrift.push({ manifest: row, current });
      continue;
    }
    if (!current) {
      plan.unexpectedMissing.push(row);
    } else if (sameNameState(current, row.desiredAfter) && current.mergedIntoId === row.expectedBefore.mergedIntoId) {
      plan.alreadyMatched.push(row);
    } else if (sameIdentityState(current, row.expectedBefore)) {
      plan.updates.push({ manifest: row, current });
    } else {
      plan.unexpectedDrift.push({ manifest: row, current });
    }
  }
  return plan;
}

export function enforceFailClosedPlan(plan: FioPlan): void {
  if (plan.unexpectedMissing.length > 0) throw new Error(`unexpected missing rows (${plan.unexpectedMissing.length})`);
  if (plan.unexpectedDrift.length > 0) throw new Error(`unexpected row drift (${plan.unexpectedDrift.length})`);
}

export function assertTestTarget(databaseUrl: string | undefined, databaseName: string, explicitTest: boolean): void {
  if (!explicitTest) throw new Error("explicit --test flag is required");
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is invalid");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }
  if (parsed.hostname !== "127.0.0.1") throw new Error("TEST FIO operation requires exact loopback host 127.0.0.1");
  const urlDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (urlDatabase !== "bersoncarebot_test") throw new Error("DATABASE_URL must target bersoncarebot_test");
  if (databaseName !== "bersoncarebot_test") throw new Error("current_database() must equal bersoncarebot_test");
}

export function summarizePlan(plan: FioPlan): Record<string, number> {
  return {
    total:
      plan.updates.length +
      plan.alreadyMatched.length +
      plan.expectedMissing.length +
      plan.preservedCurrent.length +
      plan.unexpectedMissing.length +
      plan.unexpectedDrift.length,
    eligibleUpdates: plan.updates.length,
    alreadyMatched: plan.alreadyMatched.length,
    expectedMissing: plan.expectedMissing.length,
    preservedCurrent: plan.preservedCurrent.length,
    unexpectedMissing: plan.unexpectedMissing.length,
    unexpectedDrift: plan.unexpectedDrift.length,
  };
}
