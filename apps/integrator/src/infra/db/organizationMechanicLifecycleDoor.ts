import { sql } from 'drizzle-orm';
import type { DbPort } from '../../kernel/contracts/index.js';
import { getCurrentOrganizationPrincipalId } from '../principal/organizationPrincipal.js';
import { getIntegratorDrizzleSession } from './drizzle.js';

export type OrganizationMechanicLifecycleState =
  | 'full_access'
  | 'grace'
  | 'read_only'
  | 'disabled'
  | 'unconfigured';

export type OrganizationMechanicLifecycleAccess = {
  ladderState: OrganizationMechanicLifecycleState;
  mutationAllowed: boolean;
};

export type OrganizationMechanicLifecycleDoorInput = {
  organizationId: string;
  mechanic: string;
};

export type OrganizationMechanicLifecycleDoorFailureCode =
  | 'organization_principal_required'
  | 'organization_principal_mismatch'
  | 'organization_id_required'
  | 'mechanic_required'
  | 'door_answer_missing'
  | 'door_answer_invalid';

export class OrganizationMechanicLifecycleDoorError extends Error {
  readonly code: OrganizationMechanicLifecycleDoorFailureCode;

  constructor(code: OrganizationMechanicLifecycleDoorFailureCode) {
    super(code);
    this.name = 'OrganizationMechanicLifecycleDoorError';
    this.code = code;
  }
}

type LifecycleDoorRow = {
  state: unknown;
  mutation_allowed: unknown;
};

const LIFECYCLE_STATES = new Set<OrganizationMechanicLifecycleState>([
  'full_access',
  'grace',
  'read_only',
  'disabled',
  'unconfigured',
]);

function rowsFromDrizzleExecute(raw: unknown): LifecycleDoorRow[] {
  if (Array.isArray(raw)) return raw as LifecycleDoorRow[];
  if (raw !== null && typeof raw === 'object' && 'rows' in raw) {
    const rows = (raw as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as LifecycleDoorRow[]) : [];
  }
  return [];
}

/**
 * Integrator-side lifecycle door for any write path.
 *
 * The canonical state calculation remains in
 * `app.resolve_organization_mechanic_access(uuid, text)`. Drizzle has no table DSL for a
 * parameterized set-returning PostgreSQL function, so the call uses Drizzle's parameterized `sql`
 * fragment on the active transaction session. It never falls back to `DbPort.query`.
 */
export async function resolveOrganizationMechanicLifecycleAccess(
  db: DbPort,
  input: OrganizationMechanicLifecycleDoorInput,
): Promise<OrganizationMechanicLifecycleAccess> {
  const organizationId = input.organizationId.trim();
  const mechanic = input.mechanic.trim();
  if (!organizationId) {
    throw new OrganizationMechanicLifecycleDoorError('organization_id_required');
  }
  if (!mechanic) {
    throw new OrganizationMechanicLifecycleDoorError('mechanic_required');
  }

  const principalOrganizationId = getCurrentOrganizationPrincipalId();
  if (principalOrganizationId !== organizationId) {
    throw new OrganizationMechanicLifecycleDoorError(
      principalOrganizationId
        ? 'organization_principal_mismatch'
        : 'organization_principal_required',
    );
  }

  const result = await getIntegratorDrizzleSession(db).execute(
    sql`
      SELECT access.state, access.mutation_allowed
      FROM app.resolve_organization_mechanic_access(
        ${organizationId}::uuid,
        ${mechanic}::text
      ) AS access
    `,
  );
  const row = rowsFromDrizzleExecute(result)[0];
  if (!row) {
    throw new OrganizationMechanicLifecycleDoorError('door_answer_missing');
  }
  if (
    typeof row.state !== 'string' ||
    !LIFECYCLE_STATES.has(row.state as OrganizationMechanicLifecycleState) ||
    typeof row.mutation_allowed !== 'boolean'
  ) {
    throw new OrganizationMechanicLifecycleDoorError('door_answer_invalid');
  }

  return {
    ladderState: row.state as OrganizationMechanicLifecycleState,
    mutationAllowed: row.mutation_allowed,
  };
}
