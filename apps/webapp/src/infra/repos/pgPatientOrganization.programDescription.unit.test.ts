import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappSql: vi.fn(),
}));

import { createPgPatientOrganizationPort } from './pgPatientOrganization';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getWebappSqlDb.mockReturnValue(fakes.db);
});

describe('patient program description read root', () => {
  it('issues only the declared patient scalar root for an owned instance', async () => {
    const patientId = '11111111-1111-4111-8111-111111111111';
    const instanceId = '22222222-2222-4222-8222-222222222222';
    fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ description: 'Берегите темп' }] });

    await expect(
      createPgPatientOrganizationPort().findTreatmentProgramDescriptionForPatient(
        patientId,
        instanceId,
      ),
    ).resolves.toBe('Берегите темп');

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
    expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(0, 3)).toEqual([
      fakes.db,
      'app.read_current_patient_treatment_program_description(uuid)',
      [instanceId],
    ]);
  });

  it('returns null when the patient root makes a foreign instance invisible', async () => {
    fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ description: null }] });

    await expect(
      createPgPatientOrganizationPort().findTreatmentProgramDescriptionForPatient(
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
      ),
    ).resolves.toBeNull();
  });
});
