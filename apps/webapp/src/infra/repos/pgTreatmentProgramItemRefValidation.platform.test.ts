import { beforeEach, describe, expect, it, vi } from 'vitest';

const getOrganizationIdMock = vi.hoisted(() => vi.fn());
const exerciseFindFirstMock = vi.hoisted(() => vi.fn());
const templateFindFirstMock = vi.hoisted(() => vi.fn());
const mechanicEnabledMock = vi.hoisted(() => vi.fn());

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: getOrganizationIdMock,
}));
vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => ({
    query: {
      lfkExercises: { findFirst: exerciseFindFirstMock },
      lfkComplexTemplates: { findFirst: templateFindFirstMock },
    },
  }),
}));
vi.mock('@/infra/repos/pgOrgEntitlements', () => ({
  createPgOrgEntitlementsPort: () => ({ getTariffForOrg: vi.fn(), listOverrides: vi.fn() }),
}));
vi.mock('@/modules/org-entitlements/service', () => ({
  isMechanicEnabled: mechanicEnabledMock,
}));

import { createPgTreatmentProgramItemRefValidationPort } from './pgTreatmentProgramItemRefValidation';

describe('treatment program platform LFK assignment gate', () => {
  beforeEach(() => {
    getOrganizationIdMock.mockReset();
    exerciseFindFirstMock.mockReset();
    templateFindFirstMock.mockReset();
    mechanicEnabledMock.mockReset();
    getOrganizationIdMock.mockReturnValue('a0000000-0000-4000-8000-000000000001');
  });

  it('denies a platform exercise when exercise_catalog is OFF', async () => {
    mechanicEnabledMock.mockResolvedValue(false);
    exerciseFindFirstMock.mockResolvedValue(null);
    const port = createPgTreatmentProgramItemRefValidationPort();
    await expect(
      port.assertItemRefExists('exercise', '550e8400-e29b-41d4-a716-446655440000'),
    ).rejects.toThrow(/не найден или недоступен/);
    expect(mechanicEnabledMock).toHaveBeenCalledWith(
      expect.anything(),
      'a0000000-0000-4000-8000-000000000001',
      'exercise_catalog',
    );
  });

  it('allows the same tagged platform exercise when exercise_catalog is ON', async () => {
    mechanicEnabledMock.mockResolvedValue(true);
    exerciseFindFirstMock.mockResolvedValue({ id: '550e8400-e29b-41d4-a716-446655440000' });
    const port = createPgTreatmentProgramItemRefValidationPort();
    await expect(
      port.assertItemRefExists('exercise', '550e8400-e29b-41d4-a716-446655440000'),
    ).resolves.toBeUndefined();
  });

  it('applies the same OFF gate to platform complexes', async () => {
    mechanicEnabledMock.mockResolvedValue(false);
    templateFindFirstMock.mockResolvedValue(null);
    const port = createPgTreatmentProgramItemRefValidationPort();
    await expect(
      port.assertItemRefExists('lfk_complex', '550e8400-e29b-41d4-a716-446655440001'),
    ).rejects.toThrow(/не найден или недоступен/);
  });
});
