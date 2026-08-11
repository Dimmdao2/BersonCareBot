import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomUUID } from 'node:crypto';
import {
  isWebappLockedInfraCronSource,
  isWebappLockedMediaWorkerControlSource,
} from './webappLockedInfraCronSources.js';

export {
  hashPortTypedArgs,
  PORT_CONTEXT_ZERO_ARGS_HASH,
  withPortContextTransaction,
  type PortContextClass,
  type PortContextPrincipal,
  type PortContextQueryable,
  type PortTypedArg,
} from './portContext.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/**
 * Acceptance for a `platform_users.id` used as a DB principal (C-1 / D7, 2026-07-26).
 *
 * It is DELIBERATELY the plain 8-4-4-4-12 hex shape, not {@link UUID_RE}. The strict form asserts
 * RFC-4122 version 1-5 plus the `10x` variant; PostgreSQL's own `uuid` type asserts NEITHER — it
 * accepts any 32 hex digits — so a row can legitimately hold an id that the strict test rejects
 * (the DEV seed rows `00000000-0000-0000-0000-00000000000{2,3}` do, and any future UUIDv7 id
 * would too). That divergence was a live defect: the webapp classified such an id as "DB-backed"
 * via its own loose predicate, then this normalizer threw when the same id was installed as a
 * principal, so the identity read failed and the session was rejected forever — a permanent 401
 * with no way out. The two predicates are now ONE, exported below, so "we will read this id from
 * the DB" and "this id may be a principal" can never disagree again.
 *
 * What is retained is everything with a security purpose: fixed length, hex-only charset, exact
 * delimiter positions and lowercase normalization — enough that a principal string can never be a
 * `tg:…`-style external id, carry whitespace, or vary in encoding. The version/variant nibbles
 * carry no security property here; they were shape trivia the database does not enforce.
 * {@link UUID_RE} is untouched and still guards organization ids and correlation ids.
 */
const PLATFORM_USER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER_RE = /^[1-9][0-9]*$/;
const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;

export const BC_CORRELATION_ID_HEADER = 'x-bc-correlation-id';

declare const correlationIdBrand: unique symbol;
export type CorrelationId = string & { readonly [correlationIdBrand]: true };

export type ObservabilityContext = {
  correlationId: CorrelationId;
  orgId?: string;
};

export type ObservabilityContextInput = {
  correlationId?: unknown;
  /** Trusted organization ownership only; never populate this from a request header. */
  organizationId?: string | null;
};

const APP_ORG_CONFIG_KEY = 'app.org';
const APP_PATIENT_USER_CONFIG_KEY = 'app.patient_user_id';
const APP_INTEGRATOR_USER_CONFIG_KEY = 'app.integrator_user_id';
export const DB_PRINCIPAL_CONTEXT_MODE_ENV = 'DB_PRINCIPAL_CONTEXT_MODE';
export const DB_PRINCIPAL_SIGNING_SECRET_ENV = 'DB_PRINCIPAL_SIGNING_SECRET';
export const DEFAULT_DB_PRINCIPAL_CONTEXT_MODE = 'legacy-guc';
export const DB_PRINCIPAL_STAFF_ROLE = 'app_staff';
export const DB_PRINCIPAL_PATIENT_ROLE = 'app_patient';
export const DB_PRINCIPAL_PLATFORM_SETTINGS_ROLE = 'app_platform_settings';
export const DB_PRINCIPAL_CLINIC_BILLING_ROLE = 'app_clinic_billing';

export type DbOperationalRuntimeRole =
  | 'app_operational_diagnostic'
  | 'app_operational_delivery_worker'
  | 'app_operational_media_worker'
  | 'app_operational_scheduler'
  | 'app_config_reader';

export type DbPrincipalKind =
  | 'organization'
  | 'staff'
  | 'clinicBilling'
  | 'patient'
  | 'integrator'
  | 'platform'
  | 'bootstrap'
  | 'infra';

export type DbOrganizationPrincipal = {
  kind: 'organization';
  organizationId: string;
  source?: string;
};

export type DbStaffPrincipal = {
  kind: 'staff';
  organizationId: string;
  platformUserId: string;
  source?: string;
};

export type DbClinicBillingPrincipal = {
  kind: 'clinicBilling';
  organizationId: string;
  platformUserId: string;
  source?: string;
};

export type DbPatientPrincipal = {
  kind: 'patient';
  organizationId?: string;
  platformUserId: string;
  source?: string;
};

export type DbIntegratorPrincipal = {
  kind: 'integrator';
  organizationId: string;
  integratorUserId: string;
  source?: string;
};

/** Platform operations are deliberately unscoped: they never borrow an organization. */
export type DbPlatformPrincipal = {
  kind: 'platform';
  platformUserId: string;
  source?: string;
};

export type DbBootstrapPrincipal = {
  kind: 'bootstrap';
  source?: string;
};

export type DbInfraPrincipal = {
  kind: 'infra';
  organizationId?: string;
  source?: string;
};

export type DbPrincipal =
  | DbOrganizationPrincipal
  | DbStaffPrincipal
  | DbClinicBillingPrincipal
  | DbPatientPrincipal
  | DbIntegratorPrincipal
  | DbPlatformPrincipal
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

export type DbClinicBillingPrincipalInput = {
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

export type DbPlatformPrincipalInput = {
  platformUserId: string;
  source?: string;
};

export type DbBootstrapPrincipalInput = {
  source?: string;
};

export type DbInfraPrincipalInput = {
  organizationId?: string | null;
  source?: string;
};

type DbPrincipalApplyScope = 'transaction' | 'connection';

type DbPrincipalContextCell = {
  current: DbPrincipal | undefined;
  correlationId?: CorrelationId;
  observabilityOrganizationId?: string;
};

type DbPrincipalQueryable = {
  query(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows?: readonly Record<string, unknown>[] } | unknown>;
};

export async function setDbOperationalRuntimeRole(
  client: DbPrincipalQueryable,
  role: DbOperationalRuntimeRole,
): Promise<void> {
  let statement: string;
  switch (role) {
    case 'app_operational_diagnostic':
      statement = 'SET ROLE app_operational_diagnostic';
      break;
    case 'app_operational_delivery_worker':
      statement = 'SET ROLE app_operational_delivery_worker';
      break;
    case 'app_operational_media_worker':
      statement = 'SET ROLE app_operational_media_worker';
      break;
    case 'app_operational_scheduler':
      statement = 'SET ROLE app_operational_scheduler';
      break;
    case 'app_config_reader':
      statement = 'SET ROLE app_config_reader';
      break;
    default:
      throw new Error('Unsupported DB operational runtime role');
  }
  await client.query(statement);
}

/** Selects the only runtime role permitted for platform-global settings requests. */
export async function setDbPlatformSettingsRuntimeRole(
  client: DbPrincipalQueryable,
): Promise<void> {
  await client.query(`SET ROLE ${DB_PRINCIPAL_PLATFORM_SETTINGS_ROLE}`);
}

/** Selects the organization-scoped billing role after the clinic-management guard authorizes it. */
export async function setDbClinicBillingRuntimeRole(client: DbPrincipalQueryable): Promise<void> {
  await client.query(`SET ROLE ${DB_PRINCIPAL_CLINIC_BILLING_ROLE}`);
}

/** Clears a role selected through `setDbOperationalRuntimeRole` at the shared DB chokepoint. */
export async function resetDbOperationalRuntimeRole(client: DbPrincipalQueryable): Promise<void> {
  await client.query('RESET ROLE');
}

/** Installs only an organization context for a narrow operational capability after its SET ROLE. */
export async function applyDbOperationalOrganizationContextToConnection(
  client: DbPrincipalQueryable,
  organizationId: string | undefined,
  options: DbPrincipalApplyOptions = {},
): Promise<void> {
  if (options.mode === 'locked' || options.mode === 'shadow') {
    if (organizationId === undefined) {
      await client.query('SELECT app.release_principal_context()');
      return;
    }
    await installSignedDbPrincipalContext(
      client,
      createDbOrganizationPrincipal({ organizationId, source: 'operational-config-reader' }),
      options.signer,
    );
    return;
  }

  await setDbPrincipalConfig(client, APP_ORG_CONFIG_KEY, organizationId ?? '', 'connection');
  await setDbPrincipalConfig(client, APP_PATIENT_USER_CONFIG_KEY, '', 'connection');
  await setDbPrincipalConfig(client, APP_INTEGRATOR_USER_CONFIG_KEY, '', 'connection');
}

/** Clears the operational organization context without changing the caller-selected capability role. */
export async function clearDbOperationalOrganizationContextFromConnection(
  client: DbPrincipalQueryable,
  options: DbPrincipalApplyOptions = {},
): Promise<void> {
  if (options.mode === 'locked' || options.mode === 'shadow') {
    await client.query('SELECT app.release_principal_context()');
    return;
  }
  await clearDbPrincipalConfig(client, 'connection');
}

export type DbPrincipalSigner = {
  secret: string;
  ttlMs?: number;
  now?: () => Date;
  nonce?: () => string;
};

export type DbPrincipalApplyOptions =
  | {
      mode?: 'legacy-guc';
    }
  | {
      mode: 'shadow';
      signer: DbPrincipalSigner;
    }
  | {
      mode: 'locked';
      signer: DbPrincipalSigner;
    };

export type DbPrincipalContextMode = 'legacy-guc' | 'shadow' | 'locked';

export type DbPrincipalApplyOptionsInput = {
  mode?: string | null | undefined;
  signingSecret?: string | null | undefined;
  ttlMs?: number;
  now?: () => Date;
  nonce?: () => string;
};

const principalStorage = new AsyncLocalStorage<DbPrincipalContextCell>();

export function normalizeDbPrincipalOrganizationId(organizationId: string): string {
  return normalizeUuid(organizationId, 'Invalid DB principal organization id');
}

/**
 * THE predicate for "this string may be used as a `platform_users.id`". Both the principal layer
 * (below) and the webapp's session layer (`shared/platform-user/isPlatformUserUuid.ts`) must use
 * this one function — see {@link PLATFORM_USER_UUID_RE} for why they used to disagree and what
 * that cost.
 */
export function isDbPrincipalPlatformUserId(platformUserId: string): boolean {
  return PLATFORM_USER_UUID_RE.test(platformUserId.trim());
}

export function normalizeDbPrincipalPlatformUserId(platformUserId: string): string {
  const trimmed = platformUserId.trim();
  if (!isDbPrincipalPlatformUserId(trimmed)) {
    throw new Error('Invalid DB principal platform user id');
  }
  return trimmed.toLowerCase();
}

export function normalizeDbPrincipalIntegratorUserId(
  integratorUserId: string | number | bigint,
): string {
  if (typeof integratorUserId === 'bigint') {
    if (integratorUserId <= 0n || integratorUserId > MAX_SIGNED_BIGINT) {
      throw new Error('Invalid DB principal integrator user id');
    }
    return integratorUserId.toString();
  }

  if (typeof integratorUserId === 'number') {
    if (!Number.isSafeInteger(integratorUserId) || integratorUserId <= 0) {
      throw new Error('Invalid DB principal integrator user id');
    }
    return String(integratorUserId);
  }

  const trimmed = integratorUserId.trim();
  if (!POSITIVE_INTEGER_RE.test(trimmed)) {
    throw new Error('Invalid DB principal integrator user id');
  }
  if (BigInt(trimmed) > MAX_SIGNED_BIGINT) {
    throw new Error('Invalid DB principal integrator user id');
  }
  return trimmed;
}

export function normalizeDbPrincipal(principal: DbPrincipal): DbPrincipal {
  switch (principal.kind) {
    case 'organization':
      return createDbOrganizationPrincipal(principal);
    case 'staff':
      return createDbStaffPrincipal(principal);
    case 'clinicBilling':
      return createDbClinicBillingPrincipal(principal);
    case 'patient':
      return createDbPatientPrincipal(principal);
    case 'integrator':
      return createDbIntegratorPrincipal(principal);
    case 'platform':
      return createDbPlatformPrincipal(principal);
    case 'bootstrap':
      return createDbBootstrapPrincipal(principal);
    case 'infra':
      return createDbInfraPrincipal(principal);
  }
}

export function createDbOrganizationPrincipal(
  input: DbOrganizationPrincipalInput,
): DbOrganizationPrincipal {
  return {
    kind: 'organization',
    organizationId: normalizeDbPrincipalOrganizationId(input.organizationId),
    ...copyOptionalSource(input),
  };
}

export function createDbStaffPrincipal(input: DbStaffPrincipalInput): DbStaffPrincipal {
  return {
    kind: 'staff',
    organizationId: normalizeDbPrincipalOrganizationId(input.organizationId),
    platformUserId: normalizeDbPrincipalPlatformUserId(input.platformUserId),
    ...copyOptionalSource(input),
  };
}

export function createDbClinicBillingPrincipal(
  input: DbClinicBillingPrincipalInput,
): DbClinicBillingPrincipal {
  return {
    kind: 'clinicBilling',
    organizationId: normalizeDbPrincipalOrganizationId(input.organizationId),
    platformUserId: normalizeDbPrincipalPlatformUserId(input.platformUserId),
    ...copyOptionalSource(input),
  };
}

export function createDbPatientPrincipal(input: DbPatientPrincipalInput): DbPatientPrincipal {
  return {
    kind: 'patient',
    ...(input.organizationId == null
      ? {}
      : { organizationId: normalizeDbPrincipalOrganizationId(input.organizationId) }),
    platformUserId: normalizeDbPrincipalPlatformUserId(input.platformUserId),
    ...copyOptionalSource(input),
  };
}

export function createDbIntegratorPrincipal(
  input: DbIntegratorPrincipalInput,
): DbIntegratorPrincipal {
  return {
    kind: 'integrator',
    organizationId: normalizeDbPrincipalOrganizationId(input.organizationId),
    integratorUserId: normalizeDbPrincipalIntegratorUserId(input.integratorUserId),
    ...copyOptionalSource(input),
  };
}

export function createDbPlatformPrincipal(input: DbPlatformPrincipalInput): DbPlatformPrincipal {
  return {
    kind: 'platform',
    platformUserId: normalizeDbPrincipalPlatformUserId(input.platformUserId),
    ...copyOptionalSource(input),
  };
}

export function createDbBootstrapPrincipal(
  input: DbBootstrapPrincipalInput = {},
): DbBootstrapPrincipal {
  return {
    kind: 'bootstrap',
    ...copyOptionalSource(input),
  };
}

export function createDbInfraPrincipal(input: DbInfraPrincipalInput = {}): DbInfraPrincipal {
  return {
    kind: 'infra',
    ...(input.organizationId == null
      ? {}
      : { organizationId: normalizeDbPrincipalOrganizationId(input.organizationId) }),
    ...copyOptionalSource(input),
  };
}

export function getCurrentDbPrincipal(): DbPrincipal | undefined {
  return principalStorage.getStore()?.current;
}

/** Accepts only a canonical UUID. Arbitrary caller text is never copied into logs/headers. */
export function parseCorrelationId(value: unknown): CorrelationId | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return UUID_RE.test(normalized) ? (normalized as CorrelationId) : undefined;
}

/** Keeps a valid inbound UUID or replaces missing/forged/oversized input with a fresh UUID. */
export function resolveCorrelationId(value?: unknown): CorrelationId {
  return parseCorrelationId(value) ?? (randomUUID() as CorrelationId);
}

export function getCurrentCorrelationId(): CorrelationId | undefined {
  return principalStorage.getStore()?.correlationId;
}

/**
 * Installs a correlation id in the existing principal ALS cell. This is intentionally the same
 * storage used by DB principal propagation: a second request/job AsyncLocalStorage would be able
 * to drift or leak independently.
 */
export function ensureCorrelationId(value?: unknown): CorrelationId {
  const cell = principalStorage.getStore();
  if (cell?.correlationId) return cell.correlationId;
  const correlationId = resolveCorrelationId(value);
  if (cell) {
    cell.correlationId = correlationId;
  } else {
    principalStorage.enterWith({ current: undefined, correlationId });
  }
  return correlationId;
}

/** Request/job ingress boundary: replaces any inherited id with this request's bounded id. */
export function enterWithCorrelationId(value?: unknown): CorrelationId {
  const correlationId = resolveCorrelationId(value);
  const cell = principalStorage.getStore();
  if (cell) {
    cell.correlationId = correlationId;
  } else {
    principalStorage.enterWith({ current: undefined, correlationId });
  }
  return correlationId;
}

/** Runs one request/job under bounded observability fields without changing its DB principal. */
export function runWithObservabilityContext<T>(input: ObservabilityContextInput, fn: () => T): T {
  const previous = principalStorage.getStore();
  const correlationId = resolveCorrelationId(input.correlationId ?? previous?.correlationId);
  const organizationId =
    input.organizationId === undefined
      ? previous?.observabilityOrganizationId
      : input.organizationId === null
        ? undefined
        : normalizeDbPrincipalOrganizationId(input.organizationId);
  return principalStorage.run(
    {
      current: previous?.current,
      correlationId,
      ...(organizationId === undefined ? {} : { observabilityOrganizationId: organizationId }),
    },
    fn,
  );
}

/** Closed, low-cardinality-safe pino context. No user/body/error values are copied. */
export function getCurrentObservabilityContext(): Partial<ObservabilityContext> {
  const cell = principalStorage.getStore();
  if (!cell) return {};
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  const organizationId = principalOrganizationId ?? cell.observabilityOrganizationId;
  return {
    ...(cell.correlationId === undefined ? {} : { correlationId: cell.correlationId }),
    ...(organizationId === undefined ? {} : { orgId: organizationId }),
  };
}

/** Header fragment for an existing context; does not create ambient state outside a request/job. */
export function getCurrentCorrelationIdHeader():
  | Record<typeof BC_CORRELATION_ID_HEADER, string>
  | Record<string, never> {
  const correlationId = getCurrentCorrelationId();
  return correlationId === undefined ? {} : { [BC_CORRELATION_ID_HEADER]: correlationId };
}

export function getCurrentDbPrincipalOrganizationId(): string | undefined {
  const principal = getCurrentDbPrincipal();
  // A patient identity may be organization-agnostic (multi-clinic overview) or carry the
  // application-selected organization for clinic-specific screens. Expose only that explicit
  // selection; never derive or guess an organization here.
  if (principal?.kind === 'patient') {
    return principal.organizationId;
  }
  if (principal?.kind === 'infra') {
    return principal.organizationId;
  }
  return isOrganizationScopedPrincipal(principal) ? principal.organizationId : undefined;
}

export function getCurrentDbPrincipalPlatformUserId(): string | undefined {
  const principal = getCurrentDbPrincipal();
  if (
    principal?.kind === 'staff' ||
    principal?.kind === 'patient' ||
    principal?.kind === 'platform'
  ) {
    return principal.platformUserId;
  }
  return undefined;
}

export function getCurrentDbPrincipalIntegratorUserId(): string | undefined {
  const principal = getCurrentDbPrincipal();
  return principal?.kind === 'integrator' ? principal.integratorUserId : undefined;
}

export function runWithDbPrincipal<T>(principal: DbPrincipal, fn: () => T): T {
  const previous = principalStorage.getStore();
  return principalStorage.run(
    {
      current: normalizeDbPrincipal(principal),
      ...(previous?.correlationId === undefined ? {} : { correlationId: previous.correlationId }),
      ...(previous?.observabilityOrganizationId === undefined
        ? {}
        : { observabilityOrganizationId: previous.observabilityOrganizationId }),
    },
    fn,
  );
}

/**
 * Re-enters the DB principal ALS context scoped to EXACTLY `principal` — including `undefined` —
 * for the duration of `fn`. Unlike `runWithDbPrincipal`, this accepts `undefined` verbatim instead
 * of requiring an already-normalized principal, because it exists to REPLAY a principal snapshot
 * that was captured synchronously at an earlier point in time (e.g. taskdb #821: the moment a
 * Drizzle plain-read query is issued, before its deferred, non-native-Promise `QueryPromise` thenable
 * actually runs `.then()`) onto that later, disconnected continuation. Reading `getCurrentDbPrincipal()`
 * fresh at that later point would silently pick up whatever principal happens to be ambient THEN
 * (possibly a different tenant, or none) instead of the one active when the query was issued — this
 * function exists specifically so callers can pin the ORIGINAL snapshot instead. Never memoize or
 * reuse a single call's result across queries/requests; always capture a fresh snapshot per query.
 */
export function runWithDbPrincipalSnapshot<T>(principal: DbPrincipal | undefined, fn: () => T): T {
  const previous = principalStorage.getStore();
  return principalStorage.run(
    {
      current: principal,
      ...(previous?.correlationId === undefined ? {} : { correlationId: previous.correlationId }),
      ...(previous?.observabilityOrganizationId === undefined
        ? {}
        : { observabilityOrganizationId: previous.observabilityOrganizationId }),
    },
    fn,
  );
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

export function runWithDbClinicBillingPrincipal<T>(
  input: DbClinicBillingPrincipalInput,
  fn: () => T,
): T {
  return runWithDbPrincipal(createDbClinicBillingPrincipal(input), fn);
}

export function enterWithDbClinicBillingPrincipal(input: DbClinicBillingPrincipalInput): void {
  enterWithDbPrincipal(createDbClinicBillingPrincipal(input));
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

export function runWithDbPlatformPrincipal<T>(input: DbPlatformPrincipalInput, fn: () => T): T {
  return runWithDbPrincipal(createDbPlatformPrincipal(input), fn);
}

export function enterWithDbPlatformPrincipal(input: DbPlatformPrincipalInput): void {
  enterWithDbPrincipal(createDbPlatformPrincipal(input));
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

export function buildDbPrincipalApplyOptions(
  input: DbPrincipalApplyOptionsInput = {},
): DbPrincipalApplyOptions {
  const mode = normalizeDbPrincipalContextMode(input.mode);
  if (mode === 'legacy-guc') {
    return { mode };
  }

  const secret = (input.signingSecret ?? '').trim();
  if (!secret) {
    throw new Error(
      `${DB_PRINCIPAL_SIGNING_SECRET_ENV} is required when ${DB_PRINCIPAL_CONTEXT_MODE_ENV}=${mode}`,
    );
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

export function assertDbPrincipalRequestPoolCheckoutAllowed(
  options: DbPrincipalApplyOptions = {},
): void {
  assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(getCurrentDbPrincipal(), options);
}

export function assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(
  principal: DbPrincipal | undefined,
  options: DbPrincipalApplyOptions = {},
): void {
  if (options.mode !== 'locked') {
    return;
  }

  if (!principal) {
    throw new Error('DB principal context is required before scoped DB access in locked mode');
  }
  if (
    principal.kind === 'infra' &&
    (!isWebappLockedInfraCronSource(principal.source) &&
      !(
        principal.organizationId === undefined &&
        isWebappLockedMediaWorkerControlSource(principal.source)
      ))
  ) {
    throw new Error(
      'DB infra principal is not allowed to use the webapp request DB pool in locked mode',
    );
  }
}

export async function applyCurrentDbPrincipalToTransaction(
  client: DbPrincipalQueryable,
  options: DbPrincipalApplyOptions = {},
): Promise<boolean> {
  return applyDbPrincipalToTransaction(client, getCurrentDbPrincipal(), options);
}

export async function applyDbPrincipalToTransaction(
  client: DbPrincipalQueryable,
  principal: DbPrincipal | undefined,
  options: DbPrincipalApplyOptions = {},
): Promise<boolean> {
  if (principal?.kind === 'platform') {
    await applyDbPrincipal(client, principal, 'transaction');
    return true;
  }
  if (options.mode === 'locked' || options.mode === 'shadow') {
    return applySignedDbPrincipal(client, principal, options);
  }

  if (!principal) {
    return false;
  }

  if (principal.kind === 'organization') {
    await client.query("SELECT set_config('app.org', $1, true)", [principal.organizationId]);
    return true;
  }

  await applyDbPrincipal(client, principal, 'transaction');
  return true;
}

export async function applyCurrentDbPrincipalToConnection(
  client: DbPrincipalQueryable,
  options: DbPrincipalApplyOptions = {},
): Promise<boolean> {
  return applyDbPrincipalToConnection(client, getCurrentDbPrincipal(), options);
}

export async function applyDbPrincipalToConnection(
  client: DbPrincipalQueryable,
  principal: DbPrincipal | undefined,
  options: DbPrincipalApplyOptions = {},
): Promise<boolean> {
  if (principal?.kind === 'platform') {
    await applyDbPrincipal(client, principal, 'connection');
    return true;
  }
  if (options.mode === 'locked' || options.mode === 'shadow') {
    return applySignedDbPrincipal(client, principal, options);
  }

  if (!principal) {
    return false;
  }

  await applyDbPrincipal(client, principal, 'connection');
  return true;
}

export async function clearDbPrincipalFromConnection(
  client: DbPrincipalQueryable,
  options: DbPrincipalApplyOptions = {},
  principal?: DbPrincipal,
): Promise<void> {
  if (principal?.kind === 'platform') {
    try {
      await clearDbPrincipalConfig(client, 'connection');
    } finally {
      await resetDbOperationalRuntimeRole(client);
    }
    return;
  }
  if (principal?.kind === 'clinicBilling') {
    try {
      if (options.mode === 'locked' || options.mode === 'shadow') {
        await client.query('SELECT app.release_principal_context()');
      } else {
        await clearDbPrincipalConfig(client, 'connection');
      }
    } finally {
      await resetDbOperationalRuntimeRole(client);
    }
    return;
  }
  if (options.mode === 'locked' || options.mode === 'shadow') {
    await releaseSignedDbPrincipal(client, options);
    return;
  }
  await clearDbPrincipalConfig(client, 'connection');
}

export async function clearDbPrincipalFromTransaction(
  client: DbPrincipalQueryable,
  options: DbPrincipalApplyOptions = {},
  principal?: DbPrincipal,
): Promise<void> {
  if (principal?.kind === 'platform') {
    try {
      await clearDbPrincipalConfig(client, 'transaction');
    } finally {
      await resetDbOperationalRuntimeRole(client);
    }
    return;
  }
  if (principal?.kind === 'clinicBilling') {
    try {
      if (options.mode === 'locked' || options.mode === 'shadow') {
        await client.query('SELECT app.release_principal_context()');
      } else {
        await clearDbPrincipalConfig(client, 'transaction');
      }
    } finally {
      await resetDbOperationalRuntimeRole(client);
    }
    return;
  }
  if (options.mode === 'locked' || options.mode === 'shadow') {
    await releaseSignedDbPrincipal(client, options);
    return;
  }
  await clearDbPrincipalConfig(client, 'transaction');
}

function normalizeUuid(value: string, errorMessage: string): string {
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) {
    throw new Error(errorMessage);
  }
  return trimmed.toLowerCase();
}

function normalizeDbPrincipalContextMode(mode: string | null | undefined): DbPrincipalContextMode {
  const normalized =
    (mode ?? DEFAULT_DB_PRINCIPAL_CONTEXT_MODE).trim() || DEFAULT_DB_PRINCIPAL_CONTEXT_MODE;
  if (normalized === 'legacy-guc' || normalized === 'shadow' || normalized === 'locked') {
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
    throw new Error('Invalid DB principal source');
  }
  return { source };
}

function isOrganizationScopedPrincipal(
  principal: DbPrincipal | undefined,
): principal is
  | DbOrganizationPrincipal
  | DbStaffPrincipal
  | DbClinicBillingPrincipal
  | DbIntegratorPrincipal {
  return (
    principal?.kind === 'organization' ||
    principal?.kind === 'staff' ||
    principal?.kind === 'clinicBilling' ||
    principal?.kind === 'integrator'
  );
}

async function applyDbPrincipal(
  client: DbPrincipalQueryable,
  principal: DbPrincipal,
  scope: DbPrincipalApplyScope,
): Promise<void> {
  switch (principal.kind) {
    case 'organization':
      await setDbPrincipalConfig(client, APP_ORG_CONFIG_KEY, principal.organizationId, scope);
      await setDbPrincipalConfig(client, APP_PATIENT_USER_CONFIG_KEY, '', scope);
      await setDbPrincipalConfig(client, APP_INTEGRATOR_USER_CONFIG_KEY, '', scope);
      return;
    case 'staff':
      await setDbPrincipalConfig(client, APP_ORG_CONFIG_KEY, principal.organizationId, scope);
      await setDbPrincipalConfig(client, APP_PATIENT_USER_CONFIG_KEY, '', scope);
      await setDbPrincipalConfig(client, APP_INTEGRATOR_USER_CONFIG_KEY, '', scope);
      return;
    case 'clinicBilling':
      await setDbClinicBillingRuntimeRole(client);
      await setDbPrincipalConfig(client, APP_ORG_CONFIG_KEY, principal.organizationId, scope);
      await setDbPrincipalConfig(client, APP_PATIENT_USER_CONFIG_KEY, '', scope);
      await setDbPrincipalConfig(client, APP_INTEGRATOR_USER_CONFIG_KEY, '', scope);
      return;
    case 'patient':
      await setDbPrincipalConfig(client, APP_ORG_CONFIG_KEY, principal.organizationId ?? '', scope);
      await setDbPrincipalConfig(
        client,
        APP_PATIENT_USER_CONFIG_KEY,
        principal.platformUserId,
        scope,
      );
      await setDbPrincipalConfig(client, APP_INTEGRATOR_USER_CONFIG_KEY, '', scope);
      return;
    case 'integrator':
      await setDbPrincipalConfig(client, APP_ORG_CONFIG_KEY, principal.organizationId, scope);
      await setDbPrincipalConfig(client, APP_PATIENT_USER_CONFIG_KEY, '', scope);
      await setDbPrincipalConfig(
        client,
        APP_INTEGRATOR_USER_CONFIG_KEY,
        principal.integratorUserId,
        scope,
      );
      return;
    case 'platform':
      await setDbPlatformSettingsRuntimeRole(client);
      await clearDbPrincipalConfig(client, scope);
      return;
    case 'bootstrap':
    case 'infra':
      await clearDbPrincipalConfig(client, scope);
      return;
  }
}

async function clearDbPrincipalConfig(
  client: DbPrincipalQueryable,
  scope: DbPrincipalApplyScope,
): Promise<void> {
  await setDbPrincipalConfig(client, APP_ORG_CONFIG_KEY, '', scope);
  await setDbPrincipalConfig(client, APP_PATIENT_USER_CONFIG_KEY, '', scope);
  await setDbPrincipalConfig(client, APP_INTEGRATOR_USER_CONFIG_KEY, '', scope);
}

async function setDbPrincipalConfig(
  client: DbPrincipalQueryable,
  key:
    | typeof APP_ORG_CONFIG_KEY
    | typeof APP_PATIENT_USER_CONFIG_KEY
    | typeof APP_INTEGRATOR_USER_CONFIG_KEY,
  value: string,
  scope: DbPrincipalApplyScope,
): Promise<void> {
  const local = scope === 'transaction' ? 'true' : 'false';
  await client.query(`SELECT set_config('${key}', $1, ${local})`, [value]);
}

async function applySignedDbPrincipal(
  client: DbPrincipalQueryable,
  principal: DbPrincipal | undefined,
  options: Extract<DbPrincipalApplyOptions, { mode: 'shadow' | 'locked' }>,
): Promise<boolean> {
  if (!principal) {
    if (options.mode === 'locked') {
      await releaseSignedDbPrincipal(client, options);
      throw new Error('DB principal context is required before scoped DB access in locked mode');
    }
    await releaseSignedDbPrincipal(client, options);
    console.warn('DB principal context is missing before scoped DB access in shadow mode');
    return false;
  }

  if (principal.kind === 'infra' && isWebappLockedInfraCronSource(principal.source)) {
    await client.query('RESET ROLE');
    await client.query(`SET ROLE ${DB_PRINCIPAL_STAFF_ROLE}`);
    await clearDbPrincipalConfig(client, 'connection');
    return true;
  }

  if (
    principal.kind === 'infra' &&
    principal.organizationId === undefined &&
    isWebappLockedMediaWorkerControlSource(principal.source)
  ) {
    await client.query('RESET ROLE');
    await client.query('SET ROLE app_operational_media_worker');
    await clearDbPrincipalConfig(client, 'connection');
    return true;
  }

  if (principal.kind === 'bootstrap' || principal.kind === 'infra') {
    await releaseSignedDbPrincipal(client, options);
    return false;
  }

  // Platform settings never use the signed organization/patient context: their
  // dedicated role is the complete DB authority boundary and has no tenant id.
  if (principal.kind === 'platform') {
    await setDbPlatformSettingsRuntimeRole(client);
    await clearDbPrincipalConfig(client, 'connection');
    return true;
  }

  if (options.mode === 'locked' || principal.kind === 'clinicBilling') {
    await client.query('RESET ROLE');
    await client.query(`SET ROLE ${dbRuntimeRoleForPrincipal(principal)}`);
  }

  await installSignedDbPrincipalContext(client, principal, options.signer);
  return true;
}

async function releaseSignedDbPrincipal(
  client: DbPrincipalQueryable,
  options: Extract<DbPrincipalApplyOptions, { mode: 'shadow' | 'locked' }>,
): Promise<void> {
  try {
    await client.query('SELECT app.release_principal_context()');
  } finally {
    if (options.mode === 'locked') {
      await client.query('RESET ROLE');
    }
  }
}

function dbRuntimeRoleForPrincipal(
  principal:
    | DbOrganizationPrincipal
    | DbStaffPrincipal
    | DbClinicBillingPrincipal
    | DbPatientPrincipal
    | DbIntegratorPrincipal,
):
  | typeof DB_PRINCIPAL_STAFF_ROLE
  | typeof DB_PRINCIPAL_CLINIC_BILLING_ROLE
  | typeof DB_PRINCIPAL_PATIENT_ROLE {
  switch (principal.kind) {
    case 'organization':
    case 'staff':
      return DB_PRINCIPAL_STAFF_ROLE;
    case 'clinicBilling':
      return DB_PRINCIPAL_CLINIC_BILLING_ROLE;
    case 'patient':
    case 'integrator':
      return DB_PRINCIPAL_PATIENT_ROLE;
  }
}

async function installSignedDbPrincipalContext(
  client: DbPrincipalQueryable,
  principal:
    | DbOrganizationPrincipal
    | DbStaffPrincipal
    | DbClinicBillingPrincipal
    | DbPatientPrincipal
    | DbIntegratorPrincipal,
  signer: DbPrincipalSigner,
): Promise<void> {
  const backendPid = await readBackendPid(client);
  const expiresEpoch = Math.floor(
    ((signer.now?.() ?? new Date()).getTime() + (signer.ttlMs ?? 30_000)) / 1000,
  );
  const nonce = signer.nonce?.() ?? randomUUID();
  const patientUserId = principal.kind === 'patient' ? principal.platformUserId : '';
  const integratorUserId = principal.kind === 'integrator' ? principal.integratorUserId : '';
  const organizationId =
    principal.kind === 'patient' ? (principal.organizationId ?? '') : principal.organizationId;
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
      'SELECT app.install_signed_context(',
      '$1::text, $2::integer, $3::bigint, $4::uuid,',
      '$5::uuid, $6::bigint, $7::text',
      ')',
    ].join(' '),
    [
      nonce,
      backendPid,
      expiresEpoch,
      organizationId || null,
      patientUserId || null,
      integratorUserId || null,
      createHmac('sha256', signer.secret).update(canonicalPayload).digest('hex'),
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
    'v1',
    input.nonce,
    String(input.backendPid),
    String(input.expiresEpoch),
    input.organizationId,
    input.patientUserId,
    input.integratorUserId,
  ].join('|');
}

async function readBackendPid(client: DbPrincipalQueryable): Promise<number> {
  const result = await client.query('SELECT pg_backend_pid() AS backend_pid');
  const rows = (result as { rows?: readonly Record<string, unknown>[] }).rows;
  const raw = rows?.[0]?.backend_pid;
  const backendPid = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(backendPid) || backendPid <= 0) {
    throw new Error('Could not read PostgreSQL backend pid for DB principal context');
  }
  return backendPid;
}

export type SaasIsolationTelemetryEventClass =
  | 'missing_principal'
  | 'invalid_signature_or_install'
  | 'role_pool_mismatch'
  | 'rls_denial'
  | 'cleanup_failure'
  | 'unclassified_background_operation';
export type SaasIsolationBackgroundSource =
  | { service: 'integrator'; operation: 'integrator_http_request' | 'integrator_projection' }
  | {
      service: 'worker';
      operation: 'worker_queue_drain' | 'worker_projection_delivery' | 'worker_outgoing_delivery';
    }
  | { service: 'scheduler'; operation: 'scheduler_lock' | 'scheduler_dispatch_tick' }
  | { service: 'media_worker'; operation: 'media_transcode_tick' };

export type SaasIsolationTelemetryTransportStatus = {
  state: 'idle' | 'ready' | 'degraded';
  queueLength: number;
  acceptedEvents: number;
  persistedEvents: number;
  transportFailures: number;
  droppedCircuitOpen: number;
  droppedQueueFull: number;
  probeAttempts: number;
  probeFailures: number;
  circuitOpen: boolean;
};

export type SaasIsolationBackgroundReporter = ((error: unknown) => void) & {
  /** Executes the caller-provided, rollback-safe write-path probe. */
  probeWriter(): Promise<boolean>;
  /** Redacted, process-local and bounded transport counters; never includes errors or payloads. */
  inspectTransportStatus(): SaasIsolationTelemetryTransportStatus;
};

export function classifySaasIsolationFailure(error: unknown): SaasIsolationTelemetryEventClass {
  const value =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; message?: unknown })
      : {};
  const message =
    typeof error === 'string'
      ? error
      : typeof value.message === 'string'
        ? value.message
        : error instanceof Error
          ? error.message
          : '';
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

export function isRecognizedSaasIsolationFailure(error: unknown): boolean {
  const value =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; message?: unknown })
      : {};
  const message =
    typeof error === 'string' ? error : typeof value.message === 'string' ? value.message : '';
  return (
    value.code === '42501' ||
    /principal context is required|signed context|signature|install_signed_context|release_principal_context|permission denied for (table|schema|sequence|function|relation)|row-level security|row level security/i.test(
      message,
    )
  );
}

/**
 * Process-family integration point. `query` must be backed by a dedicated max=1 pool, never the
 * request/job client that just failed. Calls synchronously enqueue and are bounded/circuit-broken.
 */
export function createSaasIsolationBackgroundReporter(input: {
  source: SaasIsolationBackgroundSource;
  query: (sql: string, values: readonly unknown[]) => Promise<unknown>;
  probe?: () => Promise<void>;
  onStatus?: (status: SaasIsolationTelemetryTransportStatus) => void;
  now?: () => number;
  timeoutMs?: number;
}): SaasIsolationBackgroundReporter {
  const queue: SaasIsolationTelemetryEventClass[] = [];
  const now = input.now ?? Date.now;
  const timeoutMs = input.timeoutMs ?? 250;
  let draining = false;
  let circuitOpenUntil = 0;
  let state: SaasIsolationTelemetryTransportStatus['state'] = 'idle';
  let acceptedEvents = 0;
  let persistedEvents = 0;
  let transportFailures = 0;
  let droppedCircuitOpen = 0;
  let droppedQueueFull = 0;
  let probeAttempts = 0;
  let probeFailures = 0;

  function increment(value: number): number {
    return value >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : value + 1;
  }

  function inspectTransportStatus(): SaasIsolationTelemetryTransportStatus {
    return {
      state,
      queueLength: queue.length,
      acceptedEvents,
      persistedEvents,
      transportFailures,
      droppedCircuitOpen,
      droppedQueueFull,
      probeAttempts,
      probeFailures,
      circuitOpen: now() < circuitOpenUntil,
    };
  }

  function publishStatus(): void {
    try {
      input.onStatus?.(inspectTransportStatus());
    } catch {
      // Observability callbacks must never break the primary request/job path.
    }
  }

  function publishDropMilestone(value: number): void {
    if (value === 1 || value === 10 || value === 100 || value === 1_000 || value === 10_000) {
      publishStatus();
    }
  }

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        if (now() < circuitOpenUntil) {
          queue.length = 0;
          return;
        }
        const eventClass = queue.shift();
        if (!eventClass) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            input.query('SELECT app.report_saas_isolation_event($1, $2, $3, $4)', [
              eventClass,
              input.source.service,
              input.source.operation,
              'unexplained',
            ]),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('saas_isolation_telemetry_timeout')),
                timeoutMs,
              );
            }),
          ]);
          persistedEvents = increment(persistedEvents);
          state = 'ready';
        } catch {
          transportFailures = increment(transportFailures);
          state = 'degraded';
          circuitOpenUntil = now() + 30_000;
          queue.length = 0;
          publishStatus();
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
    } finally {
      draining = false;
    }
  }

  const report = ((error: unknown): void => {
    if (!isRecognizedSaasIsolationFailure(error)) return;
    if (now() < circuitOpenUntil) {
      droppedCircuitOpen = increment(droppedCircuitOpen);
      publishDropMilestone(droppedCircuitOpen);
      return;
    }
    if (queue.length >= 32) {
      droppedQueueFull = increment(droppedQueueFull);
      publishDropMilestone(droppedQueueFull);
      return;
    }
    acceptedEvents = increment(acceptedEvents);
    queue.push(classifySaasIsolationFailure(error));
    void drain();
  }) as SaasIsolationBackgroundReporter;

  report.probeWriter = async (): Promise<boolean> => {
    probeAttempts = increment(probeAttempts);
    if (!input.probe) {
      probeFailures = increment(probeFailures);
      state = 'degraded';
      publishStatus();
      return false;
    }
    try {
      await input.probe();
      state = 'ready';
      circuitOpenUntil = 0;
      publishStatus();
      return true;
    } catch {
      probeFailures = increment(probeFailures);
      transportFailures = increment(transportFailures);
      state = 'degraded';
      circuitOpenUntil = now() + 30_000;
      publishStatus();
      return false;
    }
  };
  report.inspectTransportStatus = inspectTransportStatus;
  return report;
}

export {
  WEBAPP_LOCKED_INFRA_CRON_SOURCES,
  isWebappLockedInfraCronSource,
  WEBAPP_LOCKED_MEDIA_WORKER_CONTROL_SOURCE,
  isWebappLockedMediaWorkerControlSource,
} from './webappLockedInfraCronSources.js';
