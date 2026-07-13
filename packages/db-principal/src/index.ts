import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomUUID } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER_RE = /^[1-9][0-9]*$/;
const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;

const APP_ORG_CONFIG_KEY = "app.org";
const APP_PATIENT_USER_CONFIG_KEY = "app.patient_user_id";
const APP_INTEGRATOR_USER_CONFIG_KEY = "app.integrator_user_id";
export const DB_PRINCIPAL_CONTEXT_MODE_ENV = "DB_PRINCIPAL_CONTEXT_MODE";
export const DB_PRINCIPAL_SIGNING_SECRET_ENV = "DB_PRINCIPAL_SIGNING_SECRET";
export const DEFAULT_DB_PRINCIPAL_CONTEXT_MODE = "legacy-guc";
export const DB_PRINCIPAL_STAFF_ROLE = "app_staff";
export const DB_PRINCIPAL_PATIENT_ROLE = "app_patient";

export type DbPrincipalKind =
  | "organization"
  | "staff"
  | "patient"
  | "integrator"
  | "bootstrap"
  | "infra";

export type DbOrganizationPrincipal = {
  kind: "organization";
  organizationId: string;
  source?: string;
};

export type DbStaffPrincipal = {
  kind: "staff";
  organizationId: string;
  platformUserId: string;
  source?: string;
};

export type DbPatientPrincipal = {
  kind: "patient";
  organizationId?: string;
  platformUserId: string;
  source?: string;
};

export type DbIntegratorPrincipal = {
  kind: "integrator";
  organizationId: string;
  integratorUserId: string;
  source?: string;
};

export type DbBootstrapPrincipal = {
  kind: "bootstrap";
  source?: string;
};

export type DbInfraPrincipal = {
  kind: "infra";
  source?: string;
};

export type DbPrincipal =
  | DbOrganizationPrincipal
  | DbStaffPrincipal
  | DbPatientPrincipal
  | DbIntegratorPrincipal
  | DbBootstrapPrincipal
  | DbInfraPrincipal;

export type DbOrganizationPrincipalInput = {
  organizationId: string;
  source?: string;
};

export type DbStaffPrincipalInput = {
  organizationId: string;
  platformUserId: string;
  source?: string;
};

export type DbPatientPrincipalInput = {
  organizationId?: string | null;
  platformUserId: string;
  source?: string;
};

export type DbIntegratorPrincipalInput = {
  organizationId: string;
  integratorUserId: string | number | bigint;
  source?: string;
};

export type DbBootstrapPrincipalInput = {
  source?: string;
};

export type DbInfraPrincipalInput = {
  source?: string;
};

type DbPrincipalApplyScope = "transaction" | "connection";

type DbPrincipalContextCell = {
  current: DbPrincipal;
};

type DbPrincipalQueryable = {
  query(sql: string, values?: readonly unknown[]): Promise<{ rows?: readonly Record<string, unknown>[] } | unknown>;
};

export type DbPrincipalSigner = {
  secret: string;
  ttlMs?: number;
  now?: () => Date;
  nonce?: () => string;
};

export type DbPrincipalApplyOptions =
  | {
      mode?: "legacy-guc";
    }
  | {
      mode: "shadow";
      signer: DbPrincipalSigner;
    }
  | {
      mode: "locked";
      signer: DbPrincipalSigner;
    };

export type DbPrincipalContextMode = "legacy-guc" | "shadow" | "locked";

export type DbPrincipalApplyOptionsInput = {
  mode?: string | null | undefined;
  signingSecret?: string | null | undefined;
  ttlMs?: number;
  now?: () => Date;
  nonce?: () => string;
};

const principalStorage = new AsyncLocalStorage<DbPrincipalContextCell>();

export function normalizeDbPrincipalOrganizationId(organizationId: string): string {
  return normalizeUuid(organizationId, "Invalid DB principal organization id");
}

export function normalizeDbPrincipalPlatformUserId(platformUserId: string): string {
  return normalizeUuid(platformUserId, "Invalid DB principal platform user id");
}

export function normalizeDbPrincipalIntegratorUserId(integratorUserId: string | number | bigint): string {
  if (typeof integratorUserId === "bigint") {
    if (integratorUserId <= 0n || integratorUserId > MAX_SIGNED_BIGINT) {
      throw new Error("Invalid DB principal integrator user id");
    }
    return integratorUserId.toString();
  }

  if (typeof integratorUserId === "number") {
    if (!Number.isSafeInteger(integratorUserId) || integratorUserId <= 0) {
      throw new Error("Invalid DB principal integrator user id");
    }
    return String(integratorUserId);
  }

  const trimmed = integratorUserId.trim();
  if (!POSITIVE_INTEGER_RE.test(trimmed)) {
    throw new Error("Invalid DB principal integrator user id");
  }
  if (BigInt(trimmed) > MAX_SIGNED_BIGINT) {
    throw new Error("Invalid DB principal integrator user id");
  }
  return trimmed;
}

export function normalizeDbPrincipal(principal: DbPrincipal): DbPrincipal {
  switch (principal.kind) {
    case "organization":
      return createDbOrganizationPrincipal(principal);
    case "staff":
      return createDbStaffPrincipal(principal);
    case "patient":
      return createDbPatientPrincipal(principal);
    case "integrator":
      return createDbIntegratorPrincipal(principal);
    case "bootstrap":
      return createDbBootstrapPrincipal(principal);
    case "infra":
      return createDbInfraPrincipal(principal);
  }
}

export function createDbOrganizationPrincipal(input: DbOrganizationPrincipalInput): DbOrganizationPrincipal {
  return {
    kind: "organization",
    organizationId: normalizeDbPrincipalOrganizationId(input.organizationId),
    ...copyOptionalSource(input),
  };
}

export function createDbStaffPrincipal(input: DbStaffPrincipalInput): DbStaffPrincipal {
  return {
    kind: "staff",
    organizationId: normalizeDbPrincipalOrganizationId(input.organizationId),
    platformUserId: normalizeDbPrincipalPlatformUserId(input.platformUserId),
    ...copyOptionalSource(input),
  };
}

export function createDbPatientPrincipal(input: DbPatientPrincipalInput): DbPatientPrincipal {
  return {
    kind: "patient",
    ...(input.organizationId == null ? {} : { organizationId: normalizeDbPrincipalOrganizationId(input.organizationId) }),
    platformUserId: normalizeDbPrincipalPlatformUserId(input.platformUserId),
    ...copyOptionalSource(input),
  };
}

export function createDbIntegratorPrincipal(input: DbIntegratorPrincipalInput): DbIntegratorPrincipal {
  return {
    kind: "integrator",
    organizationId: normalizeDbPrincipalOrganizationId(input.organizationId),
    integratorUserId: normalizeDbPrincipalIntegratorUserId(input.integratorUserId),
    ...copyOptionalSource(input),
  };
}

export function createDbBootstrapPrincipal(input: DbBootstrapPrincipalInput = {}): DbBootstrapPrincipal {
  return {
    kind: "bootstrap",
    ...copyOptionalSource(input),
  };
}

export function createDbInfraPrincipal(input: DbInfraPrincipalInput = {}): DbInfraPrincipal {
  return {
    kind: "infra",
    ...copyOptionalSource(input),
  };
}

export function getCurrentDbPrincipal(): DbPrincipal | undefined {
  return principalStorage.getStore()?.current;
}

export function getCurrentDbPrincipalOrganizationId(): string | undefined {
  const principal = getCurrentDbPrincipal();
  return isOrganizationScopedPrincipal(principal) ? principal.organizationId : undefined;
}

export function getCurrentDbPrincipalPlatformUserId(): string | undefined {
  const principal = getCurrentDbPrincipal();
  if (principal?.kind === "staff" || principal?.kind === "patient") {
    return principal.platformUserId;
  }
  return undefined;
}

export function getCurrentDbPrincipalIntegratorUserId(): string | undefined {
  const principal = getCurrentDbPrincipal();
  return principal?.kind === "integrator" ? principal.integratorUserId : undefined;
}

export function runWithDbPrincipal<T>(principal: DbPrincipal, fn: () => T): T {
  return principalStorage.run({ current: normalizeDbPrincipal(principal) }, fn);
}

export function enterWithDbPrincipal(principal: DbPrincipal): void {
  const normalized = normalizeDbPrincipal(principal);
  const cell = principalStorage.getStore();
  if (cell) {
    cell.current = normalized;
    return;
  }
  principalStorage.enterWith({ current: normalized });
}

/**
 * Idempotent setup: guarantees a principal cell exists (so a caller that bails out early still
 * fails closed under locked mode), WITHOUT clobbering one that's already there.
 *
 * This must NOT unconditionally `enterWith()` a fresh cell. Doing so used to silently discard
 * whatever cell an outer caller had already established (e.g. a requireRole.ts guard, or
 * getCurrentSession() itself, calling this before crossing a Next.js dynamic-API boundary like
 * `cookies()`) and replace it with a brand-new one scoped to the current nested continuation.
 * `enterWithDbPrincipal`/`enterWithDbStaffPrincipal`/etc. would then mutate that *inner* cell
 * correctly, but the mutation was invisible once execution unwound back out past the boundary —
 * the outer frame still held its own (never-mutated, still-bootstrap) cell. Confirmed live on
 * TEST: a route's own DB principal read straight after getCurrentSession() showed "staff", but a
 * later query in the same request handler saw "bootstrap" again. Reusing the existing cell (like
 * `enterWithDbPrincipal` already does) fixes this at the source for every caller.
 */
export function ensureDbPrincipalContext(input: DbBootstrapPrincipalInput = {}): void {
  if (principalStorage.getStore()) return;
  principalStorage.enterWith({ current: createDbBootstrapPrincipal(input) });
}

export function runWithDbOrganizationPrincipal<T>(organizationId: string, fn: () => T): T {
  return runWithDbPrincipal(createDbOrganizationPrincipal({ organizationId }), fn);
}

export function enterWithDbOrganizationPrincipal(input: DbOrganizationPrincipalInput): void {
  enterWithDbPrincipal(createDbOrganizationPrincipal(input));
}

export function runWithDbStaffPrincipal<T>(input: DbStaffPrincipalInput, fn: () => T): T {
  return runWithDbPrincipal(createDbStaffPrincipal(input), fn);
}

export function enterWithDbStaffPrincipal(input: DbStaffPrincipalInput): void {
  enterWithDbPrincipal(createDbStaffPrincipal(input));
}

export function runWithDbPatientPrincipal<T>(input: DbPatientPrincipalInput, fn: () => T): T {
  return runWithDbPrincipal(createDbPatientPrincipal(input), fn);
}

export function enterWithDbPatientPrincipal(input: DbPatientPrincipalInput): void {
  enterWithDbPrincipal(createDbPatientPrincipal(input));
}

export function runWithDbIntegratorPrincipal<T>(input: DbIntegratorPrincipalInput, fn: () => T): T {
  return runWithDbPrincipal(createDbIntegratorPrincipal(input), fn);
}

export function enterWithDbIntegratorPrincipal(input: DbIntegratorPrincipalInput): void {
  enterWithDbPrincipal(createDbIntegratorPrincipal(input));
}

export function runWithDbBootstrapPrincipal<T>(input: DbBootstrapPrincipalInput, fn: () => T): T {
  return runWithDbPrincipal(createDbBootstrapPrincipal(input), fn);
}

export function enterWithDbBootstrapPrincipal(input: DbBootstrapPrincipalInput = {}): void {
  enterWithDbPrincipal(createDbBootstrapPrincipal(input));
}

export function runWithDbInfraPrincipal<T>(input: DbInfraPrincipalInput, fn: () => T): T {
  return runWithDbPrincipal(createDbInfraPrincipal(input), fn);
}

export function enterWithDbInfraPrincipal(input: DbInfraPrincipalInput = {}): void {
  enterWithDbPrincipal(createDbInfraPrincipal(input));
}

export function buildDbPrincipalApplyOptions(input: DbPrincipalApplyOptionsInput = {}): DbPrincipalApplyOptions {
  const mode = normalizeDbPrincipalContextMode(input.mode);
  if (mode === "legacy-guc") {
    return { mode };
  }

  const secret = (input.signingSecret ?? "").trim();
  if (!secret) {
    throw new Error(`${DB_PRINCIPAL_SIGNING_SECRET_ENV} is required when ${DB_PRINCIPAL_CONTEXT_MODE_ENV}=${mode}`);
  }

  return {
    mode,
    signer: {
      secret,
      ...(input.ttlMs === undefined ? {} : { ttlMs: input.ttlMs }),
      ...(input.now === undefined ? {} : { now: input.now }),
      ...(input.nonce === undefined ? {} : { nonce: input.nonce }),
    },
  };
}

export function buildDbPrincipalApplyOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): DbPrincipalApplyOptions {
  return buildDbPrincipalApplyOptions({
    mode: env[DB_PRINCIPAL_CONTEXT_MODE_ENV],
    signingSecret: env[DB_PRINCIPAL_SIGNING_SECRET_ENV],
  });
}

export async function applyCurrentDbPrincipalToTransaction(
  client: DbPrincipalQueryable,
  options: DbPrincipalApplyOptions = {},
): Promise<boolean> {
  const principal = getCurrentDbPrincipal();
  if (options.mode === "locked" || options.mode === "shadow") {
    return applySignedDbPrincipal(client, principal, options);
  }

  if (!principal) {
    return false;
  }

  if (principal.kind === "organization") {
    await client.query("SELECT set_config('app.org', $1, true)", [principal.organizationId]);
    return true;
  }

  await applyDbPrincipal(client, principal, "transaction");
  return true;
}

export async function applyCurrentDbPrincipalToConnection(
  client: DbPrincipalQueryable,
  options: DbPrincipalApplyOptions = {},
): Promise<boolean> {
  const principal = getCurrentDbPrincipal();
  if (options.mode === "locked" || options.mode === "shadow") {
    return applySignedDbPrincipal(client, principal, options);
  }

  if (!principal) {
    return false;
  }

  await applyDbPrincipal(client, principal, "connection");
  return true;
}

export async function clearDbPrincipalFromConnection(
  client: DbPrincipalQueryable,
  options: DbPrincipalApplyOptions = {},
): Promise<void> {
  if (options.mode === "locked" || options.mode === "shadow") {
    await releaseSignedDbPrincipal(client, options);
    return;
  }
  await clearDbPrincipalConfig(client, "connection");
}

export async function clearDbPrincipalFromTransaction(
  client: DbPrincipalQueryable,
  options: DbPrincipalApplyOptions = {},
): Promise<void> {
  if (options.mode === "locked" || options.mode === "shadow") {
    await releaseSignedDbPrincipal(client, options);
    return;
  }
  await clearDbPrincipalConfig(client, "transaction");
}

function normalizeUuid(value: string, errorMessage: string): string {
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) {
    throw new Error(errorMessage);
  }
  return trimmed.toLowerCase();
}

function normalizeDbPrincipalContextMode(mode: string | null | undefined): DbPrincipalContextMode {
  const normalized = (mode ?? DEFAULT_DB_PRINCIPAL_CONTEXT_MODE).trim() || DEFAULT_DB_PRINCIPAL_CONTEXT_MODE;
  if (normalized === "legacy-guc" || normalized === "shadow" || normalized === "locked") {
    return normalized;
  }
  throw new Error(`${DB_PRINCIPAL_CONTEXT_MODE_ENV} must be legacy-guc, shadow, or locked`);
}

function copyOptionalSource(input: { source?: string }): { source?: string } {
  if (input.source === undefined) {
    return {};
  }

  const source = input.source.trim();
  if (!source) {
    throw new Error("Invalid DB principal source");
  }
  return { source };
}

function isOrganizationScopedPrincipal(principal: DbPrincipal | undefined): principal is
  | DbOrganizationPrincipal
  | DbStaffPrincipal
  | DbIntegratorPrincipal {
  return (
    principal?.kind === "organization" ||
    principal?.kind === "staff" ||
    principal?.kind === "integrator"
  );
}

async function applyDbPrincipal(
  client: DbPrincipalQueryable,
  principal: DbPrincipal,
  scope: DbPrincipalApplyScope,
): Promise<void> {
  switch (principal.kind) {
    case "organization":
      await setDbPrincipalConfig(client, APP_ORG_CONFIG_KEY, principal.organizationId, scope);
      await setDbPrincipalConfig(client, APP_PATIENT_USER_CONFIG_KEY, "", scope);
      await setDbPrincipalConfig(client, APP_INTEGRATOR_USER_CONFIG_KEY, "", scope);
      return;
    case "staff":
      await setDbPrincipalConfig(client, APP_ORG_CONFIG_KEY, principal.organizationId, scope);
      await setDbPrincipalConfig(client, APP_PATIENT_USER_CONFIG_KEY, "", scope);
      await setDbPrincipalConfig(client, APP_INTEGRATOR_USER_CONFIG_KEY, "", scope);
      return;
    case "patient":
      await setDbPrincipalConfig(client, APP_ORG_CONFIG_KEY, principal.organizationId ?? "", scope);
      await setDbPrincipalConfig(client, APP_PATIENT_USER_CONFIG_KEY, principal.platformUserId, scope);
      await setDbPrincipalConfig(client, APP_INTEGRATOR_USER_CONFIG_KEY, "", scope);
      return;
    case "integrator":
      await setDbPrincipalConfig(client, APP_ORG_CONFIG_KEY, principal.organizationId, scope);
      await setDbPrincipalConfig(client, APP_PATIENT_USER_CONFIG_KEY, "", scope);
      await setDbPrincipalConfig(client, APP_INTEGRATOR_USER_CONFIG_KEY, principal.integratorUserId, scope);
      return;
    case "bootstrap":
    case "infra":
      await clearDbPrincipalConfig(client, scope);
      return;
  }
}

async function clearDbPrincipalConfig(client: DbPrincipalQueryable, scope: DbPrincipalApplyScope): Promise<void> {
  await setDbPrincipalConfig(client, APP_ORG_CONFIG_KEY, "", scope);
  await setDbPrincipalConfig(client, APP_PATIENT_USER_CONFIG_KEY, "", scope);
  await setDbPrincipalConfig(client, APP_INTEGRATOR_USER_CONFIG_KEY, "", scope);
}

async function setDbPrincipalConfig(
  client: DbPrincipalQueryable,
  key: typeof APP_ORG_CONFIG_KEY | typeof APP_PATIENT_USER_CONFIG_KEY | typeof APP_INTEGRATOR_USER_CONFIG_KEY,
  value: string,
  scope: DbPrincipalApplyScope,
): Promise<void> {
  const local = scope === "transaction" ? "true" : "false";
  await client.query(`SELECT set_config('${key}', $1, ${local})`, [value]);
}

async function applySignedDbPrincipal(
  client: DbPrincipalQueryable,
  principal: DbPrincipal | undefined,
  options: Extract<DbPrincipalApplyOptions, { mode: "shadow" | "locked" }>,
): Promise<boolean> {
  if (!principal) {
    if (options.mode === "locked") {
      await releaseSignedDbPrincipal(client, options);
      throw new Error("DB principal context is required before scoped DB access in locked mode");
    }
    await releaseSignedDbPrincipal(client, options);
    console.warn("DB principal context is missing before scoped DB access in shadow mode");
    return false;
  }

  if (principal.kind === "bootstrap" || principal.kind === "infra") {
    await releaseSignedDbPrincipal(client, options);
    return false;
  }

  if (options.mode === "locked") {
    await client.query("RESET ROLE");
    await client.query(`SET ROLE ${dbRuntimeRoleForPrincipal(principal)}`);
  }

  await installSignedDbPrincipalContext(client, principal, options.signer);
  return true;
}

async function releaseSignedDbPrincipal(
  client: DbPrincipalQueryable,
  options: Extract<DbPrincipalApplyOptions, { mode: "shadow" | "locked" }>,
): Promise<void> {
  try {
    await client.query("SELECT app.release_principal_context()");
  } finally {
    if (options.mode === "locked") {
      await client.query("RESET ROLE");
    }
  }
}

function dbRuntimeRoleForPrincipal(
  principal: DbOrganizationPrincipal | DbStaffPrincipal | DbPatientPrincipal | DbIntegratorPrincipal,
): typeof DB_PRINCIPAL_STAFF_ROLE | typeof DB_PRINCIPAL_PATIENT_ROLE {
  switch (principal.kind) {
    case "organization":
    case "staff":
      return DB_PRINCIPAL_STAFF_ROLE;
    case "patient":
    case "integrator":
      return DB_PRINCIPAL_PATIENT_ROLE;
  }
}

async function installSignedDbPrincipalContext(
  client: DbPrincipalQueryable,
  principal: DbOrganizationPrincipal | DbStaffPrincipal | DbPatientPrincipal | DbIntegratorPrincipal,
  signer: DbPrincipalSigner,
): Promise<void> {
  const backendPid = await readBackendPid(client);
  const expiresEpoch = Math.floor(((signer.now?.() ?? new Date()).getTime() + (signer.ttlMs ?? 30_000)) / 1000);
  const nonce = signer.nonce?.() ?? randomUUID();
  const patientUserId = principal.kind === "patient" ? principal.platformUserId : "";
  const integratorUserId = principal.kind === "integrator" ? principal.integratorUserId : "";
  const organizationId = principal.kind === "patient" ? (principal.organizationId ?? "") : principal.organizationId;
  const canonicalPayload = buildCanonicalSignedPrincipalPayload({
    backendPid,
    expiresEpoch,
    integratorUserId,
    nonce,
    organizationId,
    patientUserId,
  });

  await client.query(
    [
      "SELECT app.install_signed_context(",
      "$1::text, $2::integer, $3::bigint, $4::uuid,",
      "$5::uuid, $6::bigint, $7::text",
      ")",
    ].join(" "),
    [
      nonce,
      backendPid,
      expiresEpoch,
      organizationId || null,
      patientUserId || null,
      integratorUserId || null,
      createHmac("sha256", signer.secret).update(canonicalPayload).digest("hex"),
    ],
  );
}

function buildCanonicalSignedPrincipalPayload(input: {
  backendPid: number;
  expiresEpoch: number;
  integratorUserId: string;
  nonce: string;
  organizationId: string;
  patientUserId: string;
}): string {
  return [
    "v1",
    input.nonce,
    String(input.backendPid),
    String(input.expiresEpoch),
    input.organizationId,
    input.patientUserId,
    input.integratorUserId,
  ].join("|");
}

async function readBackendPid(client: DbPrincipalQueryable): Promise<number> {
  const result = await client.query("SELECT pg_backend_pid() AS backend_pid");
  const rows = (result as { rows?: readonly Record<string, unknown>[] }).rows;
  const raw = rows?.[0]?.backend_pid;
  const backendPid = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(backendPid) || backendPid <= 0) {
    throw new Error("Could not read PostgreSQL backend pid for DB principal context");
  }
  return backendPid;
}
