import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolConfig } from 'pg';
import type {
  DbPrincipal,
  PortContextClass,
  PortContextPrincipal,
  PortTypedArg,
} from '@bersoncare/db-principal';

export type IntegratorPortCapabilityDescriptor = {
  capabilityId: string;
  targetRole: string;
  contextClass: PortContextClass;
  purpose: string;
  functionIdentity?: string;
  runtimeSources?: readonly string[];
};

export type IntegratorPortContextRuntimeConfig = {
  pool: PoolConfig;
  capabilities: Record<string, IntegratorPortCapabilityDescriptor>;
};

export type IntegratorPortCapabilityName =
  | 'request'
  | 'resolver'
  | 'delivery'
  | 'scheduler'
  | 'migration_ledger'
  | 'tenant_service'
  | 'service';

export function integratorPortCapabilityForInfraSource(
  source: string | undefined,
  capabilities: Record<string, IntegratorPortCapabilityDescriptor>,
): IntegratorPortCapabilityName {
  const normalized = source?.trim() ?? '';
  const matches = Object.entries(capabilities).filter(
    ([, descriptor]) => descriptor.purpose === 'relation'
      && descriptor.runtimeSources?.includes(normalized),
  );
  if (matches.length === 1) return matches[0]![0] as IntegratorPortCapabilityName;
  throw new Error(`Unknown integrator infra source in port-context mode: ${normalized || '<missing>'}`);
}

const capabilityStorage = new AsyncLocalStorage<IntegratorPortCapabilityName>();
export type IntegratorPortOperation = {
  functionIdentity: string;
  typedArgs: readonly PortTypedArg[];
};
const operationStorage = new AsyncLocalStorage<IntegratorPortOperation>();

export function runWithIntegratorPortOperation<T>(
  operation: IntegratorPortOperation,
  fn: () => T,
): T {
  return operationStorage.run(operation, fn);
}

/** Call-site adapter: selects a typed declared capability, never infers it from a source label. */
export function runWithIntegratorPortCapability<T>(
  capability: IntegratorPortCapabilityName,
  fn: () => T,
): T {
  return capabilityStorage.run(capability, fn);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const PURPOSE_RE = /^[a-z][a-z0-9._:-]{0,127}$/;

function requireValue(value: string | undefined, name: string): string {
  const result = value?.trim() ?? '';
  if (!result) throw new Error(`${name} is required in port-context mode`);
  return result;
}

function pem(path: string, name: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(`${name} must name a readable PEM file`);
  }
}

export function createIntegratorPortContextRuntimeConfig(
  env: Record<string, string | undefined>,
): IntegratorPortContextRuntimeConfig {
  const connectionString = requireValue(env.INTEGRATOR_DB_URL, 'INTEGRATOR_DB_URL');
  const expectedLogin = requireValue(env.INTEGRATOR_DB_LOGIN, 'INTEGRATOR_DB_LOGIN');
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('INTEGRATOR_DB_URL must be a PostgreSQL URL');
  }
  if ((url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') || !url.hostname) {
    throw new Error('INTEGRATOR_DB_URL must use a TCP PostgreSQL host');
  }
  if (decodeURIComponent(url.username) !== expectedLogin) {
    throw new Error('INTEGRATOR_DB_URL username must equal INTEGRATOR_DB_LOGIN');
  }
  for (const parameter of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey']) {
    if (url.searchParams.has(parameter))
      throw new Error(`INTEGRATOR_DB_URL must not override mTLS through ${parameter}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      requireValue(
        env.INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON,
        'INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON',
      ),
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('required')) throw error;
    throw new Error('INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON must be valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON must be an object');
  }
  const capabilities: Record<string, IntegratorPortCapabilityDescriptor> = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new Error(`port capability ${name} must be an object`);
    const descriptor = value as Partial<IntegratorPortCapabilityDescriptor>;
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
    capabilities[name] = descriptor as IntegratorPortCapabilityDescriptor;
  }
  return {
    pool: {
      connectionString,
      ssl: {
        rejectUnauthorized: true,
        ca: pem(
          requireValue(env.INTEGRATOR_DB_TLS_CA_FILE, 'INTEGRATOR_DB_TLS_CA_FILE'),
          'INTEGRATOR_DB_TLS_CA_FILE',
        ),
        cert: pem(
          requireValue(env.INTEGRATOR_DB_TLS_CERT_FILE, 'INTEGRATOR_DB_TLS_CERT_FILE'),
          'INTEGRATOR_DB_TLS_CERT_FILE',
        ),
        key: pem(
          requireValue(env.INTEGRATOR_DB_TLS_KEY_FILE, 'INTEGRATOR_DB_TLS_KEY_FILE'),
          'INTEGRATOR_DB_TLS_KEY_FILE',
        ),
        servername: url.hostname,
      },
    },
    capabilities,
  };
}

/** Explicit principal kind → declared capability; source strings are intentionally not consulted. */
export function integratorPortContextPrincipal(
  principal: DbPrincipal | undefined,
  capabilities: Record<string, IntegratorPortCapabilityDescriptor>,
): PortContextPrincipal {
  if (!principal) throw new Error('An integrator principal is required in port-context mode');
  const ambientCapability = capabilityStorage.getStore();
  const operation = operationStorage.getStore();
  const defaultCapability = operation
    ? undefined
    : principal.kind === 'integrator'
      ? 'request'
      : principal.kind === 'organization'
        ? 'tenant_service'
        : principal.kind === 'bootstrap'
          ? 'resolver'
          : principal.kind === 'infra'
            ? ambientCapability
              ?? integratorPortCapabilityForInfraSource(principal.source, capabilities)
            : undefined;
  // An outer scheduler/delivery scope never lends its service capability to a nested
  // organization transaction; the nested scope selects tenant_service explicitly.
  const operationMatches = operation
    ? Object.entries(capabilities).filter(
        ([, descriptor]) =>
          descriptor.functionIdentity === operation.functionIdentity &&
          (principal.kind === 'integrator'
            ? descriptor.contextClass === 'integrator'
            : principal.kind === 'organization'
              ? descriptor.contextClass === 'tenant_service'
              : principal.kind === 'infra'
                ? descriptor.contextClass === 'service'
                : principal.kind === 'bootstrap'
                  ? descriptor.contextClass === 'pre_session'
                  : false),
      )
    : [];
  if (operation && operationMatches.length !== 1) {
    throw new Error(
      `Missing unique declared integrator port capability for ${operation.functionIdentity}`,
    );
  }
  const key = operation
    ? operationMatches[0]![0]
    : ambientCapability === undefined
      ? defaultCapability
      : ambientCapability === 'request' && principal.kind === 'integrator'
        ? ambientCapability
        : ambientCapability === 'resolver' && principal.kind === 'bootstrap'
          ? ambientCapability
          : principal.kind === 'organization'
            ? 'tenant_service'
            : (ambientCapability === 'delivery' ||
                  ambientCapability === 'scheduler' ||
                  ambientCapability === 'migration_ledger' ||
                  ambientCapability === 'service') &&
                principal.kind === 'infra'
              ? ambientCapability
              : undefined;
  if (!key || !capabilities[key])
    throw new Error(`Missing declared integrator port capability: ${key ?? principal.kind}`);
  const descriptor = capabilities[key];
  const base = {
    capabilityId: descriptor.capabilityId,
    contextClass: descriptor.contextClass,
    targetRole: descriptor.targetRole,
    purpose: descriptor.purpose,
    ...(descriptor.functionIdentity ? { functionIdentity: descriptor.functionIdentity } : {}),
    ...(operation ? { typedArgs: operation.typedArgs } : {}),
  };
  switch (descriptor.contextClass) {
    case 'integrator':
      if (principal.kind !== 'integrator')
        throw new Error('Integrator request capability requires an integrator principal');
      return {
        ...base,
        integratorUserId: principal.integratorUserId,
        organizationId: principal.organizationId,
      };
    case 'tenant_service':
      if (principal.kind !== 'organization')
        throw new Error('Tenant service capability requires an organization principal');
      return { ...base, organizationId: principal.organizationId };
    case 'service':
      if (principal.kind !== 'infra')
        throw new Error('Service capability requires an explicit infra principal');
      return base;
    case 'pre_session':
      if (principal.kind !== 'bootstrap' || !descriptor.functionIdentity)
        throw new Error('Resolver capability requires an explicit named-root descriptor');
      return { ...base, requestId: randomUUID() };
    default:
      throw new Error(
        `Integrator capability ${key} has unsupported context class ${descriptor.contextClass}`,
      );
  }
}
