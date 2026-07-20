import { beforeEach, describe, expect, it, vi } from 'vitest';

const { principalOrganizationIdMock, runMutationMock, runWebappPgTextMock } = vi.hoisted(() => ({
  principalOrganizationIdMock: vi.fn(),
  runMutationMock: vi.fn(),
  runWebappPgTextMock: vi.fn(),
}));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: principalOrganizationIdMock,
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

function selectForUpdateSequence(rows: unknown[][]) {
  const forUpdate = vi.fn(async () => rows.shift() ?? []);
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    for: forUpdate,
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return { select: vi.fn(() => chain), forUpdate };
}

describe('pgClinicDirectory public slug resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalOrganizationIdMock.mockReturnValue(ORG);
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
        actorPlatformUserId: ACTOR,
      }),
    ).rejects.toThrow('organization_principal_mismatch');
    expect(runMutationMock).not.toHaveBeenCalled();
  });

  it('reserves one exact-org slug through a transaction', async () => {
    const { select } = selectForUpdateSequence([[], []]);
    const insertValues = vi.fn(async () => undefined);
    const tx = {
      select,
      insert: vi.fn(() => ({ values: insertValues })),
    };
    runMutationMock.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const port = createPgClinicDirectoryPort();

    await expect(
      port.reserveSlug({
        slug: 'clinic-a',
        organizationId: ORG,
        actorPlatformUserId: ACTOR,
      }),
    ).resolves.toEqual({ ok: true, slug: 'clinic-a' });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'clinic-a',
        kind: 'reservation',
        organizationId: ORG,
      }),
    );
  });

  it('claims an exact-org reservation as the single current slug', async () => {
    const reservation = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      slug: 'clinic-a',
      kind: 'reservation',
      organizationId: ORG,
    };
    const { select } = selectForUpdateSequence([[reservation], []]);
    const updateWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const tx = { select, update: vi.fn(() => ({ set: updateSet })) };
    runMutationMock.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const port = createPgClinicDirectoryPort();

    await expect(
      port.claimReservedSlug({
        slug: 'clinic-a',
        organizationId: ORG,
        actorPlatformUserId: ACTOR,
      }),
    ).resolves.toEqual({ ok: true, slug: 'clinic-a' });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'current', organizationId: ORG }),
    );
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
    const { select } = selectForUpdateSequence([[current], [reservation]]);
    const deleteWhere = vi.fn(async () => undefined);
    const updateWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const insertValues = vi.fn(async () => undefined);
    const tx = {
      select,
      delete: vi.fn(() => ({ where: deleteWhere })),
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    runMutationMock.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const port = createPgClinicDirectoryPort();

    await expect(
      port.renameSlug({
        organizationId: ORG,
        reservedSlug: 'new-clinic',
        actorPlatformUserId: ACTOR,
      }),
    ).resolves.toEqual({ ok: true, slug: 'new-clinic' });
    expect(updateSet).toHaveBeenCalledTimes(2);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ slug: 'new-clinic' }));
    expect(insertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ slug: 'old-clinic', kind: 'alias', organizationId: ORG }),
    );
    expect(insertValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        previousSlug: 'old-clinic',
        nextSlug: 'new-clinic',
        organizationId: ORG,
      }),
    );
  });
});
