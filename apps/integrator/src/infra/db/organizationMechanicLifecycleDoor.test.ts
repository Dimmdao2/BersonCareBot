import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { runWithOrganizationPrincipal } from '../principal/organizationPrincipal.js';
import {
  OrganizationMechanicLifecycleDoorError,
  resolveOrganizationMechanicLifecycleAccess,
} from './organizationMechanicLifecycleDoor.js';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function doorDb(answer: { state: string; mutation_allowed: boolean } | null) {
  const execute = vi.fn().mockResolvedValue({ rows: answer ? [answer] : [] });
  const db = {
    integratorDrizzle: { execute },
    query: vi.fn(),
    tx: vi.fn(),
  } as unknown as DbPort;
  return { db, execute };
}

async function attemptWrite(
  db: DbPort,
  write: () => void,
): Promise<Awaited<ReturnType<typeof resolveOrganizationMechanicLifecycleAccess>>> {
  const access = await resolveOrganizationMechanicLifecycleAccess(db, {
    organizationId: ORGANIZATION_ID,
    mechanic: 'patient_diaries',
  });
  if (access.mutationAllowed) write();
  return access;
}

describe('organization mechanic lifecycle door', () => {
  it('refuses a write when the mechanic is in its terminal state', async () => {
    const { db } = doorDb({ state: 'disabled', mutation_allowed: false });
    const write = vi.fn();

    const access = await runWithOrganizationPrincipal(ORGANIZATION_ID, () =>
      attemptWrite(db, write),
    );

    expect(access).toEqual({ ladderState: 'disabled', mutationAllowed: false });
    expect(write).not.toHaveBeenCalled();
  });

  it('allows a write while the mechanic is in grace', async () => {
    const { db } = doorDb({ state: 'grace', mutation_allowed: true });
    const write = vi.fn();

    const access = await runWithOrganizationPrincipal(ORGANIZATION_ID, () =>
      attemptWrite(db, write),
    );

    expect(access).toEqual({ ladderState: 'grace', mutationAllowed: true });
    expect(write).toHaveBeenCalledOnce();
  });

  it('fails closed before the database call without an organization principal', async () => {
    const { db, execute } = doorDb({ state: 'grace', mutation_allowed: true });

    await expect(
      resolveOrganizationMechanicLifecycleAccess(db, {
        organizationId: ORGANIZATION_ID,
        mechanic: 'patient_diaries',
      }),
    ).rejects.toMatchObject({
      code: 'organization_principal_required',
    } satisfies Partial<OrganizationMechanicLifecycleDoorError>);
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails closed when the database door returns no answer', async () => {
    const { db } = doorDb(null);

    await expect(
      runWithOrganizationPrincipal(ORGANIZATION_ID, () =>
        resolveOrganizationMechanicLifecycleAccess(db, {
          organizationId: ORGANIZATION_ID,
          mechanic: 'patient_diaries',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'door_answer_missing',
    } satisfies Partial<OrganizationMechanicLifecycleDoorError>);
  });

  it('fails closed when the database door call fails', async () => {
    const databaseFailure = new Error('door unavailable');
    const execute = vi.fn().mockRejectedValue(databaseFailure);
    const db = {
      integratorDrizzle: { execute },
      query: vi.fn(),
      tx: vi.fn(),
    } as unknown as DbPort;

    await expect(
      runWithOrganizationPrincipal(ORGANIZATION_ID, () =>
        resolveOrganizationMechanicLifecycleAccess(db, {
          organizationId: ORGANIZATION_ID,
          mechanic: 'patient_diaries',
        }),
      ),
    ).rejects.toBe(databaseFailure);
  });
});
