import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  currentPrincipalMock,
  principalOrganizationIdMock,
  principalPlatformUserIdMock,
  runMutationMock,
  runWebappPgTextMock,
} = vi.hoisted(() => ({
  currentPrincipalMock: vi.fn(),
  principalOrganizationIdMock: vi.fn(),
  principalPlatformUserIdMock: vi.fn(),
  runMutationMock: vi.fn(),
  runWebappPgTextMock: vi.fn(),
}));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: currentPrincipalMock,
  getCurrentDbPrincipalOrganizationId: principalOrganizationIdMock,
  getCurrentDbPrincipalPlatformUserId: principalPlatformUserIdMock,
  getCurrentObservabilityContext: vi.fn(() => ({})),
}));
vi.mock('@/infra/db/drizzleMutationTx', () => ({
  runDrizzleMutationTransaction: runMutationMock,
}));
vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
  runWebappTransaction: vi.fn(),
}));

import { createPgClinicDirectoryPort } from './pgClinicDirectory';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function selectSequence(rows: unknown[][], events: string[] = []) {
  const forUpdate = vi.fn();
  const select = vi.fn(() => {
    const result = rows.shift() ?? [];
    const chain = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      for: vi.fn(async () => {
        events.push('row-lock');
        forUpdate();
        return result;
      }),
      then: vi.fn(
        (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => {
          events.push('plain-read');
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      ),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    return chain;
  });
  return { select, forUpdate };
}

function mutationTransactionWithLock<T extends object>(tx: T, events: string[] = []) {
  const executor = {
    ...tx,
    execute: vi.fn(async () => {
      events.push('organization-lock');
      return undefined;
    }),
  };
  runMutationMock.mockImplementation(
    async (callback: (transaction: typeof executor) => Promise<unknown>) => callback(executor),
  );
  return executor;
}

describe('pgClinicDirectory public slug resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPrincipalMock.mockReturnValue({
      kind: 'staff',
      organizationId: ORG,
      platformUserId: ACTOR,
    });
    principalOrganizationIdMock.mockReturnValue(ORG);
    principalPlatformUserIdMock.mockReturnValue(ACTOR);
  });

  it('calls only the narrow bootstrap function with the given slug', async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [{ organization_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
    });
    const port = createPgClinicDirectoryPort();

    await expect(port.resolveOrganizationIdBySlug('clinic-a')).resolves.toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );

    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      expect.stringContaining('app.resolve_public_organization_by_slug'),
      ['clinic-a'],
    );
  });

  it('preserves fail-closed null from the database resolver (unknown/unpublished/inactive slug)', async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [{ organization_id: null }] });
    const port = createPgClinicDirectoryPort();
    await expect(port.resolveOrganizationIdBySlug('does-not-exist')).resolves.toBeNull();
  });

  it('returns null when the resolver yields no row at all', async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
    const port = createPgClinicDirectoryPort();
    await expect(port.resolveOrganizationIdBySlug('clinic-a')).resolves.toBeNull();
  });

  it('checks pre-signup availability through the boolean-only accessor', async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [{ available: false }] });
    const port = createPgClinicDirectoryPort();

    await expect(port.isSlugAvailable('taken-clinic')).resolves.toBe(false);
    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      expect.stringContaining('app.is_organization_slug_available'),
      ['taken-clinic'],
    );
  });

  it('keeps a former slug resolving to the same organization before and after its reclaim', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            organization_id: ORG,
            requested_slug: 'old-clinic',
            requested_kind: 'alias',
            canonical_slug: 'new-clinic',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            organization_id: ORG,
            requested_slug: 'old-clinic',
            requested_kind: 'current',
            canonical_slug: 'old-clinic',
          },
        ],
      });

    const port = createPgClinicDirectoryPort();
    await expect(port.resolveCanonicalSlug('old-clinic')).resolves.toEqual({
      organizationId: ORG,
      requestedSlug: 'old-clinic',
      canonicalSlug: 'new-clinic',
      disposition: 'redirect',
    });
    await expect(port.resolveCanonicalSlug('old-clinic')).resolves.toEqual({
      organizationId: ORG,
      requestedSlug: 'old-clinic',
      canonicalSlug: 'old-clinic',
      disposition: 'current',
    });
    expect(runWebappPgTextMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('app.resolve_public_organization_slug'),
      ['old-clinic'],
    );
    expect(runWebappPgTextMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('app.resolve_public_organization_slug'),
      ['old-clinic'],
    );
  });

  it('fails before a mutation transaction when the requested organization is not the signed principal', async () => {
    principalOrganizationIdMock.mockReturnValue(OTHER_ORG);
    const port = createPgClinicDirectoryPort();

    await expect(
      port.renameSlug({
        organizationId: ORG,
        reservedSlug: 'new-clinic',
      }),
    ).rejects.toThrow('organization_principal_mismatch');
    expect(runMutationMock).not.toHaveBeenCalled();
  });

  it('fails closed before a mutation transaction without a trusted staff actor', async () => {
    currentPrincipalMock.mockReturnValue({ kind: 'organization', organizationId: ORG });
    principalPlatformUserIdMock.mockReturnValue(undefined);
    const port = createPgClinicDirectoryPort();

    await expect(port.reserveSlug({ slug: 'clinic-a', organizationId: ORG })).rejects.toThrow(
      'staff_principal_required',
    );
    expect(runMutationMock).not.toHaveBeenCalled();
  });

  it('reserves one exact-org slug through a transaction', async () => {
    const events: string[] = [];
    const { select, forUpdate } = selectSequence([[], []], events);
    const insertValues = vi.fn(async () => undefined);
    const tx = {
      select,
      insert: vi.fn(() => ({ values: insertValues })),
    };
    const transaction = mutationTransactionWithLock(tx, events);
    const port = createPgClinicDirectoryPort();

    await expect(
      port.reserveSlug({
        slug: 'clinic-a',
        organizationId: ORG,
      }),
    ).resolves.toEqual({ ok: true, slug: 'clinic-a' });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'clinic-a',
        kind: 'reservation',
        organizationId: ORG,
        createdByPlatformUserId: ACTOR,
      }),
    );
    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(forUpdate).toHaveBeenCalledOnce();
    expect(events).toEqual(['organization-lock', 'row-lock', 'plain-read']);
  });

  it('refuses a former alias owned by a different organization without row-locking it', async () => {
    const ownReservation = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      organizationId: ORG,
    };
    const foreignCollision = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      kind: 'alias',
      organizationId: OTHER_ORG,
    };
    const events: string[] = [];
    const { select, forUpdate } = selectSequence([[ownReservation], [foreignCollision]], events);
    const update = vi.fn();
    const insert = vi.fn();
    mutationTransactionWithLock({ select, update, insert }, events);
    const port = createPgClinicDirectoryPort();

    await expect(
      port.reserveSlug({ slug: 'former-org-alias', organizationId: ORG }),
    ).resolves.toEqual({ ok: false, code: 'slug_unavailable' });

    expect(forUpdate).toHaveBeenCalledOnce();
    expect(events).toEqual(['organization-lock', 'row-lock', 'plain-read']);
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('accepts its own alias as a durable reservation without interrupting old-link resolution', async () => {
    const existingReservation = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      organizationId: ORG,
    };
    const ownAlias = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      kind: 'alias',
      organizationId: ORG,
    };
    const events: string[] = [];
    const { select } = selectSequence([[existingReservation], [ownAlias]], events);
    const deleteWhere = vi.fn(async () => undefined);
    const tx = {
      select,
      delete: vi.fn(() => ({ where: deleteWhere })),
      update: vi.fn(),
      insert: vi.fn(),
    };
    mutationTransactionWithLock(tx, events);
    const port = createPgClinicDirectoryPort();

    await expect(
      port.reserveSlug({ slug: 'former-own-alias', organizationId: ORG }),
    ).resolves.toEqual({ ok: true, slug: 'former-own-alias' });

    expect(deleteWhere).toHaveBeenCalledOnce();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(events).toEqual(['organization-lock', 'row-lock', 'plain-read']);
  });

  it('updates its own locked reservation when the requested slug is already that same claim', async () => {
    const ownReservation = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' };
    const events: string[] = [];
    const { select, forUpdate } = selectSequence([[ownReservation], [ownReservation]], events);
    const updateWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const tx = {
      select,
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(),
    };
    mutationTransactionWithLock(tx, events);
    const port = createPgClinicDirectoryPort();

    await expect(port.reserveSlug({ slug: 'clinic-a', organizationId: ORG })).resolves.toEqual({
      ok: true,
      slug: 'clinic-a',
    });

    expect(forUpdate).toHaveBeenCalledOnce();
    expect(events).toEqual(['organization-lock', 'row-lock', 'plain-read']);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ slug: 'clinic-a' }));
    expect(updateWhere).toHaveBeenCalledOnce();
  });

  it("maps the DB global-unique refusal of another organization's former slug to slug_unavailable", async () => {
    runMutationMock.mockRejectedValue({
      code: '23505',
      constraint: 'uq_organization_slug_claims_slug',
    });
    const port = createPgClinicDirectoryPort();

    await expect(
      port.reserveSlug({ slug: 'former-other-org-slug', organizationId: ORG }),
    ).resolves.toEqual({
      ok: false,
      code: 'slug_unavailable',
    });
  });

  it('claims an exact-org reservation as the single current slug', async () => {
    const reservation = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      slug: 'clinic-a',
      kind: 'reservation',
      organizationId: ORG,
    };
    const events: string[] = [];
    const { select } = selectSequence([[reservation], [], [{ title: 'Clinic A' }]], events);
    const updateWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const insertValues = vi.fn(async () => undefined);
    const tx = {
      select,
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    mutationTransactionWithLock(tx, events);
    const port = createPgClinicDirectoryPort();

    await expect(
      port.claimReservedSlug({
        slug: 'clinic-a',
        organizationId: ORG,
      }),
    ).resolves.toEqual({ ok: true, slug: 'clinic-a' });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'current',
        organizationId: ORG,
        createdByPlatformUserId: ACTOR,
      }),
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        slug: 'clinic-a',
        displayName: 'Clinic A',
        isPublished: true,
      }),
    );
    expect(events).toEqual(['organization-lock', 'row-lock', 'row-lock', 'plain-read']);
  });

  it('renames atomically, retains the old slug as an alias and appends audit', async () => {
    const current = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      slug: 'old-clinic',
      kind: 'current',
      organizationId: ORG,
    };
    const reservation = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      slug: 'new-clinic',
      kind: 'reservation',
      organizationId: ORG,
    };
    const events: string[] = [];
    const { select } = selectSequence([[current], [reservation]], events);
    const deleteWhere = vi.fn(async () => undefined);
    const updateWhere = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1 })
      // A draft directory projection is optional. Rename still succeeds when no row is present;
      // the DB guard validates it later if/when the projection is inserted.
      .mockResolvedValueOnce({ rowCount: 0 });
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const insertValues = vi.fn(async () => undefined);
    const tx = {
      select,
      delete: vi.fn(() => ({ where: deleteWhere })),
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    mutationTransactionWithLock(tx, events);
    const port = createPgClinicDirectoryPort();

    await expect(
      port.renameSlug({
        organizationId: ORG,
        reservedSlug: 'new-clinic',
      }),
    ).resolves.toEqual({ ok: true, slug: 'new-clinic' });
    expect(updateSet).toHaveBeenCalledTimes(2);
    expect(updateWhere).toHaveBeenCalledTimes(2);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ slug: 'new-clinic' }));
    expect(insertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        slug: 'old-clinic',
        kind: 'alias',
        organizationId: ORG,
        createdByPlatformUserId: ACTOR,
      }),
    );
    expect(insertValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        previousSlug: 'old-clinic',
        nextSlug: 'new-clinic',
        organizationId: ORG,
        actorPlatformUserId: ACTOR,
      }),
    );
    expect(events).toEqual(['organization-lock', 'row-lock', 'row-lock']);
  });

  it('reclaims its own alias atomically, retains the released current slug and appends audit', async () => {
    const current = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      slug: 'current-clinic',
      kind: 'current',
      organizationId: ORG,
    };
    const formerAlias = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      slug: 'former-clinic',
      kind: 'alias',
      organizationId: ORG,
    };
    const events: string[] = [];
    const { select } = selectSequence([[current], [formerAlias]], events);
    const updateWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const insertValues = vi.fn(async () => undefined);
    const tx = {
      select,
      delete: vi.fn(),
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    mutationTransactionWithLock(tx, events);
    const port = createPgClinicDirectoryPort();

    await expect(
      port.renameSlug({
        organizationId: ORG,
        reservedSlug: 'former-clinic',
      }),
    ).resolves.toEqual({ ok: true, slug: 'former-clinic' });

    expect(tx.delete).not.toHaveBeenCalled();
    expect(updateSet).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'alias' }));
    expect(updateSet).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'current' }));
    expect(updateSet).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ slug: 'former-clinic' }),
    );
    expect(insertValues).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        previousSlug: 'current-clinic',
        nextSlug: 'former-clinic',
        organizationId: ORG,
        actorPlatformUserId: ACTOR,
      }),
    );
    expect(events).toEqual(['organization-lock', 'row-lock', 'row-lock']);
  });
});
