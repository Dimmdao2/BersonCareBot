import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { PoolConfig } from 'pg';
import type { DbPrincipal, PortContextClass, PortContextPrincipal } from '@bersoncare/db-principal';

export type PortCapabilityDescriptor = {
  capabilityId: string;
  targetRole: string;
  contextClass: PortContextClass;
  purpose: string;
  functionIdentity?: string;
};

export type WebappPortContextRuntimeConfig = {
  staff: PoolConfig;
  patient: PoolConfig;
  capabilities: Record<string, PortCapabilityDescriptor>;
};

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
      cert: requireFile(required(input.certFile, `${input.label}_DB_TLS_CERT_FILE`), `${input.label}_DB_TLS_CERT_FILE`),
      key: requireFile(required(input.keyFile, `${input.label}_DB_TLS_KEY_FILE`), `${input.label}_DB_TLS_KEY_FILE`),
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
      !descriptor.capabilityId || !UUID_RE.test(descriptor.capabilityId) ||
      !descriptor.targetRole || !ROLE_RE.test(descriptor.targetRole) ||
      !descriptor.purpose || !PURPOSE_RE.test(descriptor.purpose) ||
      !['pre_session', 'staff', 'patient', 'platform', 'integrator', 'tenant_service', 'service'].includes(descriptor.contextClass ?? '')
    ) {
      throw new Error(`port capability ${name} has an invalid descriptor`);
    }
    if ((descriptor.purpose === 'relation' && descriptor.functionIdentity) ||
        (descriptor.purpose !== 'relation' && !descriptor.functionIdentity)) {
      throw new Error(`port capability ${name} must declare a function identity exactly for a named root`);
    }
    capabilities[name] = descriptor as PortCapabilityDescriptor;
  }
  return capabilities;
}

export function createWebappPortContextRuntimeConfig(env: Record<string, string | undefined>): WebappPortContextRuntimeConfig {
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
    capabilities: parseCapabilities(env.WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON),
  };
}

function capabilityFor(
  capabilities: Record<string, PortCapabilityDescriptor>,
  name: string,
): PortCapabilityDescriptor {
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
): { pool: 'staff' | 'patient'; principal: PortContextPrincipal } {
  if (!principal) throw new Error('A webapp principal is required in port-context mode');
  const descriptorName = principal.kind === 'patient' ? 'patient' : principal.kind;
  const descriptor = capabilityFor(capabilities, descriptorName);
  const base = {
    capabilityId: descriptor.capabilityId,
    contextClass: descriptor.contextClass,
    targetRole: descriptor.targetRole,
    purpose: descriptor.purpose,
    ...(descriptor.functionIdentity ? { functionIdentity: descriptor.functionIdentity } : {}),
  } satisfies Omit<PortContextPrincipal, 'actorRef' | 'subjectRef' | 'organizationId' | 'integratorUserId' | 'requestId'>;
  switch (descriptor.contextClass) {
    case 'staff':
      if (principal.kind !== 'staff' && principal.kind !== 'clinicBilling') throw new Error(`Capability ${descriptorName} requires a staff principal`);
      return { pool: 'staff', principal: { ...base, actorRef: principal.platformUserId, organizationId: principal.organizationId } };
    case 'patient':
      if (principal.kind !== 'patient' || !principal.organizationId) throw new Error('Patient port context requires an organization-scoped patient principal');
      return { pool: 'patient', principal: { ...base, actorRef: principal.platformUserId, subjectRef: principal.platformUserId, organizationId: principal.organizationId } };
    case 'platform':
      if (principal.kind !== 'platform') throw new Error('Platform port context requires a platform principal');
      return { pool: 'staff', principal: { ...base, actorRef: principal.platformUserId } };
    case 'tenant_service':
      if (principal.kind !== 'organization') throw new Error('Tenant-service port context requires an organization principal');
      return { pool: 'staff', principal: { ...base, organizationId: principal.organizationId } };
    case 'service':
      if (principal.kind !== 'infra') throw new Error('Service port context requires an explicit infra principal');
      return { pool: 'staff', principal: base };
    case 'pre_session':
      if (principal.kind !== 'bootstrap' || !descriptor.functionIdentity) throw new Error('Pre-session port context requires an explicit named-root capability');
      return { pool: 'staff', principal: { ...base, requestId: randomUUID() } };
    default:
      throw new Error(`Webapp capability ${descriptorName} has unsupported context class ${descriptor.contextClass}`);
  }
}
