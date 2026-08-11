import { createHash, randomUUID } from 'node:crypto';

export type PortContextClass =
  | 'pre_session'
  | 'staff'
  | 'patient'
  | 'platform'
  | 'integrator'
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
};

export type PortContextQueryable = {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
};

export type PortTypedArg = { typeTag: string; value: Buffer | null };

const PURPOSE_RE = /^[a-z][a-z0-9._:-]{0,127}$/;
const TAG_RE = /^[a-z][a-z0-9_.]*@[1-9][0-9]*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The exact zero-argument value declared by SCHEME rev. 9. */
export const PORT_CONTEXT_ZERO_ARGS_HASH = Buffer.from(
  '0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a',
  'hex',
);

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
    if (!TAG_RE.test(arg.typeTag)) throw new Error(`invalid port typed arg tag: ${arg.typeTag}`);
    const tag = Buffer.from(arg.typeTag, 'ascii');
    if (tag.length > 128) throw new Error('port typed arg tag is too long');
    if (arg.value !== null && arg.value.length > 1_048_576) {
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
      if (!principal.requestId || !principal.functionIdentity) throw new Error('pre_session requires requestId and functionIdentity');
      return;
    case 'staff':
      if (!principal.actorRef || !principal.organizationId) throw new Error('staff requires actorRef and organizationId');
      return;
    case 'patient':
      if (!principal.actorRef || !principal.subjectRef || !principal.organizationId) throw new Error('patient requires actorRef, subjectRef and organizationId');
      return;
    case 'platform':
      if (!principal.actorRef) throw new Error('platform requires actorRef');
      return;
    case 'integrator':
      if (principal.integratorUserId === undefined) throw new Error('integrator requires integratorUserId');
      return;
    case 'service':
      return;
  }
}

/**
 * The only checkout lifecycle allowed by the mTLS contract. Any failure is deliberately
 * propagated so callers can destroy the checked-out pg client instead of returning it to a pool.
 */
export async function withPortContextTransaction<T>(
  client: PortContextQueryable,
  principal: PortContextPrincipal,
  fn: () => Promise<T>,
): Promise<T> {
  assertPrincipal(principal);
  const requestId = assertUuid('requestId', principal.requestId) ?? randomUUID();
  const actorRef = assertUuid('actorRef', principal.actorRef);
  const subjectRef = assertUuid('subjectRef', principal.subjectRef);
  const organizationId = assertUuid('organizationId', principal.organizationId);
  await client.query('BEGIN');
  try {
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
        PORT_CONTEXT_ZERO_ARGS_HASH,
        actorRef,
        subjectRef,
        organizationId,
        principal.integratorUserId === undefined ? null : String(principal.integratorUserId),
        requestId,
      ],
    );
    await client.query(`SET LOCAL ROLE ${principal.targetRole}`);
    const result = await fn();
    await client.query('RESET ROLE');
    await client.query('SELECT app.clear_port_context()');
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The original failure decides client destruction at the pool chokepoint.
    }
    throw error;
  }
}
