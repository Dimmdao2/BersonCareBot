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
        (
          onFulfilled: (value: unknown[]) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => {
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

  it("resolves aliases directly to the organization's single published current slug", async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [
        {
          organization_id: ORG,
          requested_slug: 'old-clinic',
          requested_kind: 'alias',
          canonical_slug: 'new-clinic',
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
    expect(runWebappPgTextMock).toHaveBeenCalledWith(
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

    await expect(
      port.reserveSlug({ slug: 'clinic-a', organizationId: ORG }),
    ).rejects.toThrow('staff_principal_required');
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

  it('does not row-lock a foreign collision, preventing cross-org reservation swap deadlocks', async () => {
    const ownReservation = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      organizationId: ORG,
    };
    const foreignCollision = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      organizationId: OTHER_ORG,
    };
    const events: string[] = [];
    const { select, forUpdate } = selectSequence(
      [[ownReservation], [foreignCollision]],
      events,
    );
    const update = vi.fn();
    const insert = vi.fn();
    mutationTransactionWithLock({ select, update, insert }, events);
    const port = createPgClinicDirectoryPort();

    await expect(
      port.reserveSlug({ slug: 'foreign-reservation', organizationId: ORG }),
    ).resolves.toEqual({ ok: false, code: 'slug_unavailable' });

    expect(forUpdate).toHaveBeenCalledOnce();
    expect(events).toEqual(['organization-lock', 'row-lock', 'plain-read']);
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('updates its own locked reservation when the requested slug is already that same claim', async () => {
    const ownReservation = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' };
    const events: string[] = [];
    const { select, forUpdate } = selectSequence(
      [[ownReservation], [ownReservation]],
      events,
    );
    const updateWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const tx = {
      select,
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(),
    };
    mutationTransactionWithLock(tx, events);
    const port = createPgClinicDirectoryPort();

    await expect(
      port.reserveSlug({ slug: 'clinic-a', organizationId: ORG }),
    ).resolves.toEqual({ ok: true, slug: 'clinic-a' });

    expect(forUpdate).toHaveBeenCalledOnce();
    expect(events).toEqual(['organization-lock', 'row-lock', 'plain-read']);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ slug: 'clinic-a' }));
    expect(updateWhere).toHaveBeenCalledOnce();
  });

  it('maps a global unique-index race to slug_unavailable', async () => {
    runMutationMock.mockRejectedValue({ code: '23505' });
    const port = createPgClinicDirectoryPort();

    await expect(
      port.reserveSlug({ slug: 'racing-slug', organizationId: ORG }),
    ).resolves.toEqual({ ok: false, code: 'slug_unavailable' });
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
    const { select } = selectSequence([[current], [], [reservation]], events);
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
    expect(events).toEqual(['organization-lock', 'row-lock', 'plain-read', 'row-lock']);
  });

  it('enforces the one self-service rename limit at the repository seam', async () => {
    const current = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      slug: 'current-clinic',
      kind: 'current',
      organizationId: ORG,
    };
    const events: string[] = [];
    const { select } = selectSequence([[current], [{ id: 'rename-event-1' }]], events);
    const tx = {
      select,
      delete: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
    };
    mutationTransactionWithLock(tx, events);
    const port = createPgClinicDirectoryPort();

    await expect(
      port.renameSlug({
        organizationId: ORG,
        reservedSlug: 'third-clinic',
      }),
    ).resolves.toEqual({ ok: false, code: 'rename_limit_reached' });
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(events).toEqual(['organization-lock', 'row-lock', 'plain-read']);
  });
});
