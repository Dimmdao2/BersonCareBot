import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

import { loadPatientTelegramUsername } from './pgPatientTelegramUsernameMention';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getWebappSqlDb.mockReturnValue(fakes.db);
});

describe('loadPatientTelegramUsername named root', () => {
  it('installs the exact staff root and UUID transcript before reading the canonical display handle', async () => {
    const patientId = '11111111-1111-4111-8111-111111111111';
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ display_handle: 'patient_handle' }],
    });

    await expect(loadPatientTelegramUsername(patientId)).resolves.toBe('patient_handle');

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
    const [db, functionIdentity, typedArgs, fragment] = fakes.runWebappNamedRoot.mock.calls[0] as unknown[];
    expect(db).toBe(fakes.db);
    expect(functionIdentity).toBe('app.read_patient_telegram_display_handle(uuid)');
    expect(typedArgs).toEqual([patientId]);
    expect(fragment).toBeDefined();
  });

  it('returns null when the authorized patient has no canonical handle', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ display_handle: null }] });

    await expect(
      loadPatientTelegramUsername('22222222-2222-4222-8222-222222222222'),
    ).resolves.toBeNull();
  });

  it('does not swallow a cross-organization denial from the exact root', async () => {
    const denial = Object.assign(new Error('active organization patient required'), { code: '42501' });
    fakes.runWebappNamedRoot.mockRejectedValueOnce(denial);

    await expect(
      loadPatientTelegramUsername('33333333-3333-4333-8333-333333333333'),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
