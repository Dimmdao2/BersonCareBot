import { describe, expect, it, vi } from 'vitest';
import type { BeBranch } from './types';
import {
  ONLINE_LOCATION_CITY_CODE,
  ONLINE_LOCATION_SHORT_TITLE,
  ONLINE_LOCATION_TITLE,
  findBuiltInOnlineLocation,
  isBuiltInOnlineLocation,
  setBuiltInOnlineLocationState,
} from './onlineLocation';

const ORGANIZATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORGANIZATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function branch(overrides: Partial<BeBranch>): BeBranch {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: ORGANIZATION_A,
    title: 'Москва',
    shortTitle: 'Мск',
    color: '#2563eb',
    cityCode: 'moscow',
    address: 'Адрес',
    timezone: 'Europe/Moscow',
    isActive: true,
    sortOrder: 10,
    ...overrides,
  };
}

describe('built-in Online location', () => {
  it('classifies the reserved code or title and finds it inside the exact organization', () => {
    const onlineA = branch({
      id: 'online-a',
      cityCode: ONLINE_LOCATION_CITY_CODE,
      title: ONLINE_LOCATION_TITLE,
    });
    const legacyTitleOnly = branch({
      id: 'online-legacy',
      cityCode: 'legacy-video',
      title: ONLINE_LOCATION_TITLE,
    });
    const onlineB = branch({
      id: 'online-b',
      organizationId: ORGANIZATION_B,
      cityCode: ONLINE_LOCATION_CITY_CODE,
      title: ONLINE_LOCATION_TITLE,
    });

    expect(isBuiltInOnlineLocation(onlineA)).toBe(true);
    expect(isBuiltInOnlineLocation(legacyTitleOnly)).toBe(true);
    expect(findBuiltInOnlineLocation([onlineB, onlineA], ORGANIZATION_A)).toBe(onlineA);
    expect(findBuiltInOnlineLocation([onlineB], ORGANIZATION_A)).toBeNull();
  });

  it('creates one inactive row, then toggles the same row without touching another organization', async () => {
    const rows: BeBranch[] = [
      branch({ id: 'physical-a' }),
      branch({ id: 'physical-b', organizationId: ORGANIZATION_B }),
    ];
    const listBranches = vi.fn(async (organizationId: string) =>
      rows.filter((row) => row.organizationId === organizationId),
    );
    const upsertBranch = vi.fn(
      async (input: Parameters<import('./ports').OrganizationCatalogPort['upsertBranch']>[0]) => {
        if (input.id) {
          const index = rows.findIndex(
            (row) => row.id === input.id && row.organizationId === input.organizationId,
          );
          if (index < 0) throw new Error('branch_not_found');
          rows[index] = { ...rows[index]!, ...input };
          return rows[index]!;
        }
        const created = branch({ ...input, id: 'online-a' });
        rows.push(created);
        return created;
      },
    );
    const catalog = { listBranches, upsertBranch };

    const off = await setBuiltInOnlineLocationState(catalog, {
      organizationId: ORGANIZATION_A,
      isActive: false,
      defaultColor: '#AABBCC',
    });
    const on = await setBuiltInOnlineLocationState(catalog, {
      organizationId: ORGANIZATION_A,
      isActive: true,
      defaultColor: '#AABBCC',
    });
    const onAgain = await setBuiltInOnlineLocationState(catalog, {
      organizationId: ORGANIZATION_A,
      isActive: true,
      defaultColor: '#AABBCC',
    });

    expect(off).toMatchObject({
      id: 'online-a',
      isActive: false,
      title: 'Онлайн',
      cityCode: 'online',
      color: '#AABBCC',
    });
    expect(on).toMatchObject({ id: 'online-a', isActive: true });
    expect(onAgain).toMatchObject({ id: 'online-a', isActive: true });
    expect(
      rows.filter((row) => row.organizationId === ORGANIZATION_A && isBuiltInOnlineLocation(row)),
    ).toHaveLength(1);
    expect(rows.filter((row) => row.organizationId === ORGANIZATION_B)).toEqual([
      expect.objectContaining({ id: 'physical-b', isActive: true }),
    ]);
    expect(upsertBranch).toHaveBeenCalledTimes(2);
  });

  it('fails closed instead of guessing when duplicate reserved rows already exist', () => {
    const rows = [
      branch({ id: 'online-1', cityCode: 'online' }),
      branch({ id: 'online-2', cityCode: 'ONLINE' }),
    ];
    expect(() => findBuiltInOnlineLocation(rows, ORGANIZATION_A)).toThrow(
      'online_location_duplicate',
    );
  });

  it('updates an explicit clinic color override and otherwise preserves the stored Online color', async () => {
    const stored = branch({
      id: 'online-a',
      title: ONLINE_LOCATION_TITLE,
      shortTitle: ONLINE_LOCATION_SHORT_TITLE,
      cityCode: ONLINE_LOCATION_CITY_CODE,
      color: '#123456',
      isActive: true,
    });
    const upsertBranch = vi.fn(
      async (input: Parameters<import('./ports').OrganizationCatalogPort['upsertBranch']>[0]) => ({
        ...stored,
        ...input,
      }),
    );
    const catalog = { listBranches: vi.fn().mockResolvedValue([stored]), upsertBranch };

    const unchanged = await setBuiltInOnlineLocationState(catalog, {
      organizationId: ORGANIZATION_A,
      isActive: false,
      defaultColor: '#7C3AED',
    });
    expect(unchanged.color).toBe('#123456');
    expect(upsertBranch).toHaveBeenLastCalledWith(expect.objectContaining({ color: '#123456' }));

    const overridden = await setBuiltInOnlineLocationState(catalog, {
      organizationId: ORGANIZATION_A,
      isActive: true,
      defaultColor: '#7C3AED',
      colorOverride: '#ABCDEF',
    });
    expect(overridden.color).toBe('#ABCDEF');
    expect(upsertBranch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'online-a',
        organizationId: ORGANIZATION_A,
        color: '#ABCDEF',
      }),
    );
  });
});
