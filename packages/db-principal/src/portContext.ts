import { createHash } from 'node:crypto';
import { isUtf8 } from 'node:buffer';

export type PortContextClass =
  | 'pre_session'
  | 'staff'
  | 'patient'
  | 'platform'
  | 'integrator'
  | 'tenant_service'
  | 'service';

export type PortContextPrincipal = {
  capabilityId: string;
  contextClass: PortContextClass;
  targetRole: string;
  purpose: string;
  actorRef?: string;
  subjectRef?: string;
  organizationId?: string;
  integratorUserId?: string | number | bigint;
  requestId?: string;
  functionIdentity?: string;
  typedArgs?: readonly PortTypedArg[];
};

export type PortContextQueryable = {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
  release?(error?: Error): void;
};

export type PortContextTransactionHandle = {
  /** The only client that may be used while this declared context is installed. */
  client: PortContextQueryable;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
};

export type PortTypedArg = { typeTag: string; value: Buffer | null };

const PURPOSE_RE = /^[a-z][a-z0-9._:-]{0,127}$/;
const TAG_RE = /^(uuid|oid|integer|bigint|xid8|boolean|text|name|bytea|timestamptz)@1$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The exact zero-argument value declared by SCHEME rev. 9. */
export const PORT_CONTEXT_ZERO_ARGS_HASH = Buffer.from(
  '0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a',
  'hex',
);

const MAX_TYPED_ARG_BYTES = 1_048_576;

function u16(value: number): Buffer {
  const out = Buffer.allocUnsafe(2);
  out.writeUInt16BE(value);
  return out;
}

function u32(value: number): Buffer {
  const out = Buffer.allocUnsafe(4);
  out.writeUInt32BE(value);
  return out;
}

/**
 * Byte framing shared with app.hash_port_typed_args. Values are PostgreSQL 16 binary-send bytes;
 * this function deliberately does not guess a SQL type from JavaScript input.
 */
export function hashPortTypedArgs(args: readonly PortTypedArg[]): Buffer {
  if (args.length === 0) return Buffer.from(PORT_CONTEXT_ZERO_ARGS_HASH);
  if (args.length > 64) throw new Error('port typed args may contain at most 64 values');
  const frames: Buffer[] = [Buffer.from('BCBPORTARGS\0', 'ascii'), u16(1), u16(args.length)];
  for (const [index, arg] of args.entries()) {
    if (!TAG_RE.test(arg.typeTag)) throw new Error(`unsupported port typed arg tag: ${arg.typeTag}`);
    if (arg.value !== null) assertTypedArgBinary(arg.typeTag, arg.value);
    const tag = Buffer.from(arg.typeTag, 'ascii');
    if (tag.length > 128) throw new Error('port typed arg tag is too long');
    if (arg.value !== null && arg.value.length > MAX_TYPED_ARG_BYTES) {
      throw new Error('port typed arg value is too long');
    }
    frames.push(u16(index + 1), u16(1), u16(tag.length), tag, u16(2));
    if (arg.value === null) {
      frames.push(Buffer.from([0xff, 0xff, 0xff, 0xff]));
    } else {
      frames.push(u32(arg.value.length), arg.value);
    }
  }
  return createHash('sha256').update(Buffer.concat(frames)).digest();
}

function assertTypedArgBinary(typeTag: string, value: Buffer): void {
  const type = typeTag.slice(0, -2);
  const exactLength = new Map<string, number>([
    ['uuid', 16], ['oid', 4], ['integer', 4], ['bigint', 8], ['xid8', 8], ['boolean', 1], ['timestamptz', 8],
  ]).get(type);
  if (exactLength !== undefined && value.length !== exactLength) {
    throw new Error(`${typeTag} must use ${exactLength}-byte PostgreSQL 16 binary representation`);
  }
  if (type === 'boolean' && value[0] !== 0 && value[0] !== 1) {
    throw new Error('boolean@1 must use PostgreSQL binary boolean 00 or 01');
  }
  if ((type === 'text' || type === 'name') && !isUtf8(value)) {
    throw new Error(`${typeTag} must use valid PostgreSQL UTF-8 binary representation`);
  }
  if (value.length > MAX_TYPED_ARG_BYTES) throw new Error('port typed arg value is too long');
}

function assertUuid(label: string, value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!UUID_RE.test(value)) throw new Error(`${label} must be a UUID`);
  return value.toLowerCase();
}

function assertPrincipal(principal: PortContextPrincipal): void {
  if (!UUID_RE.test(principal.capabilityId)) throw new Error('capabilityId must be a UUID');
  if (!PURPOSE_RE.test(principal.purpose)) throw new Error('invalid port context purpose');
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(principal.targetRole)) {
    throw new Error('invalid port context target role');
  }
  switch (principal.contextClass) {
    case 'pre_session':
      if (!principal.requestId || !principal.functionIdentity || principal.actorRef || principal.subjectRef || principal.organizationId || principal.integratorUserId !== undefined) throw new Error('pre_session has an invalid claims matrix');
      return;
    case 'staff':
      if (!principal.actorRef || !principal.organizationId || principal.subjectRef || principal.integratorUserId !== undefined || principal.requestId || principal.functionIdentity) throw new Error('staff has an invalid claims matrix');
      return;
    case 'patient':
      if (!principal.actorRef || !principal.subjectRef || !principal.organizationId || principal.integratorUserId !== undefined || principal.requestId || principal.functionIdentity) throw new Error('patient has an invalid claims matrix');
      return;
    case 'platform':
      if (!principal.actorRef || principal.subjectRef || principal.organizationId || principal.integratorUserId !== undefined || principal.requestId || principal.functionIdentity) throw new Error('platform has an invalid claims matrix');
      return;
    case 'integrator':
      if (principal.integratorUserId === undefined || !principal.organizationId || principal.actorRef || principal.subjectRef || principal.requestId || principal.functionIdentity) throw new Error('integrator has an invalid claims matrix');
      return;
    case 'tenant_service':
      if (!principal.organizationId || principal.actorRef || principal.subjectRef || principal.integratorUserId !== undefined || principal.requestId || principal.functionIdentity) throw new Error('tenant_service has an invalid claims matrix');
      return;
    case 'service':
      if (principal.actorRef || principal.subjectRef || principal.organizationId || principal.integratorUserId !== undefined || principal.requestId || principal.functionIdentity) throw new Error('service has an invalid claims matrix');
      return;
  }
}

function normalizeIntegratorUserId(value: string | number | bigint | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('integratorUserId number must be a safe integer');
    return String(value);
  }
  const parsed = typeof value === 'bigint' ? value : (() => {
    if (!/^-?(0|[1-9][0-9]*)$/.test(value)) throw new Error('integratorUserId must be a canonical signed decimal');
    return BigInt(value);
  })();
  if (parsed < -9223372036854775808n || parsed > 9223372036854775807n) throw new Error('integratorUserId is outside PostgreSQL bigint range');
  return parsed.toString();
}

/**
 * The only checkout lifecycle allowed by the mTLS contract. Any failure is deliberately
 * propagated so callers can destroy the checked-out pg client instead of returning it to a pool.
 */
export async function withPortContextTransaction<T>(
  client: PortContextQueryable,
  principal: PortContextPrincipal,
  fn: (client: PortContextQueryable) => Promise<T>,
): Promise<T> {
  const integratorUserId = normalizeIntegratorUserId(principal.integratorUserId);
  assertPrincipal(principal);
  const requestId = assertUuid('requestId', principal.requestId);
  const actorRef = assertUuid('actorRef', principal.actorRef);
  const subjectRef = assertUuid('subjectRef', principal.subjectRef);
  const organizationId = assertUuid('organizationId', principal.organizationId);
  const typedArgsHash = hashPortTypedArgs(principal.typedArgs ?? []);
  let begun = false;
  try {
    await client.query('BEGIN');
    begun = true;
    await client.query('RESET ROLE');
    await client.query('SELECT app.clear_port_context()');
    await client.query(
      'SELECT app.install_port_context($1::uuid, ROW(1, $2::app.port_context_class, $3::name, $4::text, $5::regprocedure, $6::bytea, $7::uuid, $8::uuid, $9::uuid, $10::bigint, $11::uuid)::app.port_context_claims)',
      [
        principal.capabilityId,
        principal.contextClass,
        principal.targetRole,
        principal.purpose,
        principal.functionIdentity ?? null,
        typedArgsHash,
        actorRef,
        subjectRef,
        organizationId,
        integratorUserId,
        requestId,
      ],
    );
    await client.query(`SET LOCAL ROLE ${principal.targetRole}`);
    const result = await fn(client);
    await client.query('RESET ROLE');
    await client.query('SELECT app.clear_port_context()');
    await client.query('COMMIT');
    return result;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    if (begun) {
      try { await client.query('ROLLBACK'); } catch { /* release below destroys the checkout. */ }
    }
    client.release?.(failure);
    throw failure;
  }
}

/**
 * Starts the same exact-client lifecycle for callers that must keep a bounded session resource
 * (the scheduler advisory-lock holder and legacy transaction-handle adapters). A query, rollback,
 * commit, or cleanup failure marks the checkout poisoned; `release()` then destroys it.
 */
export async function startPortContextTransaction(
  rawClient: PortContextQueryable,
  principal: PortContextPrincipal,
): Promise<PortContextTransactionHandle> {
  const integratorUserId = normalizeIntegratorUserId(principal.integratorUserId);
  assertPrincipal(principal);
  const requestId = assertUuid('requestId', principal.requestId);
  const actorRef = assertUuid('actorRef', principal.actorRef);
  const subjectRef = assertUuid('subjectRef', principal.subjectRef);
  const organizationId = assertUuid('organizationId', principal.organizationId);
  const typedArgsHash = hashPortTypedArgs(principal.typedArgs ?? []);
  let poisoned: Error | undefined;
  const fail = (error: unknown): Error => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    poisoned ??= normalized;
    return normalized;
  };
  const client: PortContextQueryable = {
    query: async (sql, values) => {
      try {
        return await rawClient.query(sql, values);
      } catch (error) {
        throw fail(error);
      }
    },
    release: (error) => rawClient.release?.(error),
  };

  try {
    await client.query('BEGIN');
    await client.query('RESET ROLE');
    await client.query('SELECT app.clear_port_context()');
    await client.query(
      'SELECT app.install_port_context($1::uuid, ROW(1, $2::app.port_context_class, $3::name, $4::text, $5::regprocedure, $6::bytea, $7::uuid, $8::uuid, $9::uuid, $10::bigint, $11::uuid)::app.port_context_claims)',
      [
        principal.capabilityId, principal.contextClass, principal.targetRole, principal.purpose,
        principal.functionIdentity ?? null, typedArgsHash, actorRef, subjectRef, organizationId,
        integratorUserId, requestId,
      ],
    );
    await client.query(`SET LOCAL ROLE ${principal.targetRole}`);
  } catch (error) {
    const failure = fail(error);
    try { await rawClient.query('ROLLBACK'); } catch { /* the client is destroyed below. */ }
    rawClient.release?.(failure);
    throw failure;
  }

  return {
    client,
    commit: async () => {
      try {
        await client.query('RESET ROLE');
        await client.query('SELECT app.clear_port_context()');
        await client.query('COMMIT');
      } catch (error) {
        throw fail(error);
      }
    },
    rollback: async () => {
      try {
        await rawClient.query('ROLLBACK');
      } catch (error) {
        throw fail(error);
      }
    },
    release: () => rawClient.release?.(poisoned),
  };
}
