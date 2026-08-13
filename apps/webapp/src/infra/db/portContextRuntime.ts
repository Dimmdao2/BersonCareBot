import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient, PoolConfig } from 'pg';
import type {
  DbPrincipal,
  PortContextClass,
  PortContextPrincipal,
  PortTypedArg,
} from '@bersoncare/db-principal';
import { portTypedArg, withPortContextTransaction } from '@bersoncare/db-principal';

export type PortCapabilityDescriptor = {
  capabilityId: string;
  targetRole: string;
  contextClass: PortContextClass;
  purpose: string;
  functionIdentity?: string;
  runtimeSources?: readonly string[];
};

export type WebappPortContextRuntimeConfig = {
  staff: PoolConfig;
  patient: PoolConfig;
  globalAdmin: PoolConfig;
  capabilities: Record<string, PortCapabilityDescriptor>;
};

export type WebappPortOperation = {
  functionIdentity: string;
  typedArgs: readonly PortTypedArg[];
};

const operationStorage = new AsyncLocalStorage<WebappPortOperation>();
const requestOpaqueIdentityRefs = new WeakMap<DbPrincipal, Promise<string>>();

export function runWithWebappPortOperation<T>(operation: WebappPortOperation, fn: () => T): T {
  return operationStorage.run(operation, fn);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const PURPOSE_RE = /^[a-z][a-z0-9._:-]{0,127}$/;
function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) throw new Error(`${name} is required in port-context mode`);
  return trimmed;
}

function requireFile(path: string, name: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(`${name} must name a readable PEM file`);
  }
}

function strictMtlsPoolConfig(input: {
  connectionString: string | undefined;
  expectedLogin: string | undefined;
  caFile: string | undefined;
  certFile: string | undefined;
  keyFile: string | undefined;
  label: string;
}): PoolConfig {
  const connectionString = required(input.connectionString, `${input.label}_DATABASE_URL`);
  const expectedLogin = required(input.expectedLogin, `${input.label}_DB_LOGIN`);
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`${input.label}_DATABASE_URL must be a PostgreSQL URL`);
  }
  if ((url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') || !url.hostname) {
    throw new Error(`${input.label}_DATABASE_URL must use a TCP PostgreSQL host`);
  }
  if (decodeURIComponent(url.username) !== expectedLogin) {
    throw new Error(`${input.label}_DATABASE_URL username must equal ${input.label}_DB_LOGIN`);
  }
  for (const parameter of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey']) {
    if (url.searchParams.has(parameter)) {
      throw new Error(`${input.label}_DATABASE_URL must not override mTLS through ${parameter}`);
    }
  }
  return {
    connectionString,
    ssl: {
      rejectUnauthorized: true,
      ca: requireFile(required(input.caFile, 'WEBAPP_DB_TLS_CA_FILE'), 'WEBAPP_DB_TLS_CA_FILE'),
      cert: requireFile(
        required(input.certFile, `${input.label}_DB_TLS_CERT_FILE`),
        `${input.label}_DB_TLS_CERT_FILE`,
      ),
      key: requireFile(
        required(input.keyFile, `${input.label}_DB_TLS_KEY_FILE`),
        `${input.label}_DB_TLS_KEY_FILE`,
      ),
      servername: url.hostname,
    },
  };
}

function parseCapabilities(raw: string | undefined): Record<string, PortCapabilityDescriptor> {
  let value: unknown;
  try {
    value = JSON.parse(required(raw, 'WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('required')) throw error;
    throw new Error('WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON must be valid JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON must be an object');
  }
  const capabilities: Record<string, PortCapabilityDescriptor> = {};
  for (const [name, candidate] of Object.entries(value)) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new Error(`port capability ${name} must be an object`);
    }
    const descriptor = candidate as Partial<PortCapabilityDescriptor>;
    if (
      !descriptor.capabilityId ||
      !UUID_RE.test(descriptor.capabilityId) ||
      !descriptor.targetRole ||
      !ROLE_RE.test(descriptor.targetRole) ||
      !descriptor.purpose ||
      !PURPOSE_RE.test(descriptor.purpose) ||
      ![
        'pre_session',
        'staff',
        'patient',
        'platform',
        'integrator',
        'tenant_service',
        'service',
      ].includes(descriptor.contextClass ?? '')
    ) {
      throw new Error(`port capability ${name} has an invalid descriptor`);
    }
    if (descriptor.runtimeSources !== undefined && (!Array.isArray(descriptor.runtimeSources)
      || descriptor.runtimeSources.some((source) => typeof source !== 'string' || !source.trim())
      || new Set(descriptor.runtimeSources).size !== descriptor.runtimeSources.length)) {
      throw new Error(`port capability ${name} has invalid runtime sources`);
    }
    if (
      (descriptor.purpose === 'relation' && descriptor.functionIdentity) ||
      (descriptor.purpose !== 'relation' && !descriptor.functionIdentity)
    ) {
      throw new Error(
        `port capability ${name} must declare a function identity exactly for a named root`,
      );
    }
    capabilities[name] = descriptor as PortCapabilityDescriptor;
  }
  return capabilities;
}

export function webappPortCapabilityForInfraSource(
  source: string | undefined,
  capabilities: Record<string, PortCapabilityDescriptor>,
): string {
  const normalized = source?.trim() ?? '';
  const matches = Object.entries(capabilities).filter(
    ([, descriptor]) => descriptor.purpose === 'relation'
      && descriptor.runtimeSources?.includes(normalized),
  );
  if (matches.length === 1) return matches[0]![0];
  throw new Error(`Unknown webapp infra source in port-context mode: ${normalized || '<missing>'}`);
}

export function createWebappPortContextRuntimeConfig(
  env: Record<string, string | undefined>,
): WebappPortContextRuntimeConfig {
  return {
    staff: strictMtlsPoolConfig({
      connectionString: env.DATABASE_URL_STAFF,
      expectedLogin: env.WEBAPP_DB_STAFF_LOGIN,
      caFile: env.WEBAPP_DB_TLS_CA_FILE,
      certFile: env.WEBAPP_DB_STAFF_CERT_FILE,
      keyFile: env.WEBAPP_DB_STAFF_KEY_FILE,
      label: 'WEBAPP_STAFF',
    }),
    patient: strictMtlsPoolConfig({
      connectionString: env.DATABASE_URL_PATIENT,
      expectedLogin: env.WEBAPP_DB_PATIENT_LOGIN,
      caFile: env.WEBAPP_DB_TLS_CA_FILE,
      certFile: env.WEBAPP_DB_PATIENT_CERT_FILE,
      keyFile: env.WEBAPP_DB_PATIENT_KEY_FILE,
      label: 'WEBAPP_PATIENT',
    }),
    globalAdmin: strictMtlsPoolConfig({
      connectionString: env.DATABASE_URL_GLOBAL_ADMIN,
      expectedLogin: env.WEBAPP_DB_GLOBAL_ADMIN_LOGIN,
      caFile: env.WEBAPP_DB_TLS_CA_FILE,
      certFile: env.WEBAPP_DB_GLOBAL_ADMIN_CERT_FILE,
      keyFile: env.WEBAPP_DB_GLOBAL_ADMIN_KEY_FILE,
      label: 'WEBAPP_GLOBAL_ADMIN',
    }),
    capabilities: parseCapabilities(env.WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON),
  };
}

function capabilityFor(
  capabilities: Record<string, PortCapabilityDescriptor>,
  name: string,
  principal: DbPrincipal,
): PortCapabilityDescriptor {
  const operation = operationStorage.getStore();
  if (operation) {
    const matches = Object.entries(capabilities).filter(
      ([, descriptor]) =>
        descriptor.functionIdentity === operation.functionIdentity &&
        (principal.kind === 'staff' || principal.kind === 'clinicBilling'
          ? descriptor.contextClass === 'staff'
          : principal.kind === 'patient'
            ? descriptor.contextClass === 'patient'
          : principal.kind === 'platform'
            ? descriptor.contextClass === 'platform'
            : principal.kind === 'organization'
              ? descriptor.contextClass === 'tenant_service'
              : principal.kind === 'infra'
                ? descriptor.contextClass === 'service'
                : principal.kind === 'bootstrap'
                  ? descriptor.contextClass === 'pre_session'
                  : false),
    );
    if (matches.length !== 1) {
      throw new Error(
        `Missing unique declared webapp port capability for ${operation.functionIdentity}`,
      );
    }
    return matches[0]![1];
  }
  const capability = capabilities[name];
  if (!capability) throw new Error(`Missing declared webapp port capability: ${name}`);
  return capability;
}

/**
 * The old ALS carrier remains a request identity source only. In target mode it is never installed
 * as a GUC or signed payload: this projection is validated again by the declared DB capability.
 */
export function webappPortContextPrincipal(
  principal: DbPrincipal | undefined,
  capabilities: Record<string, PortCapabilityDescriptor>,
  opaqueIdentityRef?: string,
): { pool: 'staff' | 'patient' | 'globalAdmin'; principal: PortContextPrincipal } {
  if (!principal) throw new Error('A webapp principal is required in port-context mode');
  const descriptorName =
    principal.kind === 'organization'
      ? 'tenant_service'
      : principal.kind === 'infra'
        ? webappPortCapabilityForInfraSource(principal.source, capabilities)
        : principal.kind === 'bootstrap'
          ? 'pre_session'
          : principal.kind;
  const descriptor = capabilityFor(capabilities, descriptorName, principal);
  const operation = operationStorage.getStore();
  const base = {
    capabilityId: descriptor.capabilityId,
    contextClass: descriptor.contextClass,
    targetRole: descriptor.targetRole,
    purpose: descriptor.purpose,
    ...(descriptor.functionIdentity ? { functionIdentity: descriptor.functionIdentity } : {}),
    ...(operation ? { typedArgs: operation.typedArgs } : {}),
  } satisfies Omit<
    PortContextPrincipal,
    'actorRef' | 'subjectRef' | 'organizationId' | 'integratorUserId' | 'requestId'
  >;
  switch (descriptor.contextClass) {
    case 'staff':
      if (principal.kind !== 'staff' && principal.kind !== 'clinicBilling')
        throw new Error(`Capability ${descriptorName} requires a staff principal`);
      return {
        pool: 'staff',
        principal: {
          ...base,
          actorRef: requiredOpaqueIdentityRef(opaqueIdentityRef),
          organizationId: principal.organizationId,
        },
      };
    case 'patient':
      if (
        principal.kind !== 'patient' ||
        (!principal.organizationId &&
          descriptor.purpose !== 'relation' &&
          descriptor.functionIdentity !== 'app.read_current_patient_active_organizations()')
      )
        throw new Error('Patient port context requires an organization-scoped patient principal');
      return {
        pool: 'patient',
        principal: {
          ...base,
          actorRef: requiredOpaqueIdentityRef(opaqueIdentityRef),
          subjectRef: requiredOpaqueIdentityRef(opaqueIdentityRef),
          ...(principal.organizationId ? { organizationId: principal.organizationId } : {}),
        },
      };
    case 'platform':
      if (principal.kind !== 'platform')
        throw new Error('Platform port context requires a platform principal');
      return {
        pool: 'globalAdmin',
        principal: { ...base, actorRef: requiredOpaqueIdentityRef(opaqueIdentityRef) },
      };
    case 'tenant_service':
      if (principal.kind !== 'organization')
        throw new Error('Tenant-service port context requires an organization principal');
      return { pool: 'staff', principal: { ...base, organizationId: principal.organizationId } };
    case 'service':
      if (principal.kind !== 'infra')
        throw new Error('Service port context requires an explicit infra principal');
      return {
        pool: 'staff',
        principal: {
          ...base,
          ...(principal.organizationId ? { organizationId: principal.organizationId } : {}),
        },
      };
    case 'pre_session':
      if (principal.kind !== 'bootstrap')
        throw new Error('Pre-session port context requires a bootstrap principal');
      return { pool: 'patient', principal: { ...base, requestId: randomUUID() } };
    default:
      throw new Error(
        `Webapp capability ${descriptorName} has unsupported context class ${descriptor.contextClass}`,
      );
  }
}

function requiredOpaqueIdentityRef(value: string | undefined): string {
  if (!value || !UUID_RE.test(value)) {
    throw new Error('An opaque identity reference is required for a human port context');
  }
  return value.toLowerCase();
}

function physicalIdentityId(principal: DbPrincipal): string | undefined {
  switch (principal.kind) {
    case 'staff':
    case 'clinicBilling':
    case 'patient':
    case 'platform':
      return principal.platformUserId;
    default:
      return undefined;
  }
}

function poolForPrincipal(principal: DbPrincipal): 'staff' | 'patient' | 'globalAdmin' {
  if (principal.kind === 'patient' || principal.kind === 'bootstrap') return 'patient';
  return principal.kind === 'platform' ? 'globalAdmin' : 'staff';
}

type IdentityResolverClient = {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
  release?(error?: Error): void;
};

async function runWebappPreSessionNamedRoot<T>(
  client: IdentityResolverClient,
  descriptor: PortCapabilityDescriptor,
  functionIdentity: string,
  typedArgs: readonly PortTypedArg[],
  fn: (sameClient: IdentityResolverClient) => Promise<T>,
): Promise<T> {
  if (descriptor.functionIdentity !== functionIdentity) {
    throw new Error(`Pre-session capability does not match ${functionIdentity}`);
  }
  if (descriptor.contextClass !== 'pre_session'
    || (descriptor.targetRole !== 'app_pre_session' && descriptor.targetRole !== 'app_platform_admin')) {
    throw new Error(`Invalid pre-session target for ${functionIdentity}`);
  }
  return withPortContextTransaction(
    client,
    {
      capabilityId: descriptor.capabilityId,
      contextClass: 'pre_session',
      targetRole: descriptor.targetRole,
      purpose: descriptor.purpose,
      functionIdentity,
      requestId: randomUUID(),
      typedArgs,
    },
    fn,
  );
}

function opaqueRefFromResult(result: unknown): string {
  if (!result || typeof result !== 'object' || !('rows' in result) || !Array.isArray(result.rows)) {
    throw new Error('Identity resolver returned no row set');
  }
  const row = result.rows[0];
  const opaqueRef = row && typeof row === 'object' && 'opaque_ref' in row ? row.opaque_ref : undefined;
  if (typeof opaqueRef !== 'string' || !UUID_RE.test(opaqueRef)) {
    throw new Error('Identity resolver returned an invalid opaque reference');
  }
  return opaqueRef.toLowerCase();
}

async function resolveOpaqueIdentityRef(
  client: IdentityResolverClient,
  principal: DbPrincipal,
  capabilities: Record<string, PortCapabilityDescriptor>,
): Promise<string | undefined> {
  const physicalId = physicalIdentityId(principal);
  if (!physicalId) return undefined;
  const existing = requestOpaqueIdentityRefs.get(principal);
  if (existing) return existing;

  const pool = poolForPrincipal(principal);
  const descriptorName = `${pool}_identity_resolve`;
  const descriptor = capabilities[descriptorName];
  if (
    !descriptor ||
    descriptor.contextClass !== 'pre_session' ||
    (descriptor.targetRole !== 'app_pre_session' && descriptor.targetRole !== 'app_platform_admin') ||
    descriptor.purpose !== 'identity.variant-a.resolve' ||
    descriptor.functionIdentity !== 'app.pre_session_resolve_identity(uuid)'
  ) {
    throw new Error(`Missing exact declared webapp identity capability: ${descriptorName}`);
  }

  const resolution = runWebappPreSessionNamedRoot(
    client,
    descriptor,
    'app.pre_session_resolve_identity(uuid)',
    [portTypedArg('uuid', physicalId)],
    async (sameClient) =>
      opaqueRefFromResult(
        await drizzle(sameClient as unknown as PoolClient).execute(
          sql`SELECT app.pre_session_resolve_identity(${physicalId}::uuid) AS opaque_ref`,
        ),
      ),
  );
  requestOpaqueIdentityRefs.set(principal, resolution);
  try {
    return await resolution;
  } catch (error) {
    requestOpaqueIdentityRefs.delete(principal);
    throw error;
  }
}

/** Exact physical→opaque handoff on the checked-out mTLS connection, before human context install. */
export async function resolveWebappPortContextPrincipal(
  client: IdentityResolverClient,
  principal: DbPrincipal | undefined,
  capabilities: Record<string, PortCapabilityDescriptor>,
): Promise<{ pool: 'staff' | 'patient' | 'globalAdmin'; principal: PortContextPrincipal }> {
  if (!principal) throw new Error('A webapp principal is required in port-context mode');
  const opaqueIdentityRef = await resolveOpaqueIdentityRef(client, principal, capabilities);
  return webappPortContextPrincipal(principal, capabilities, opaqueIdentityRef);
}
