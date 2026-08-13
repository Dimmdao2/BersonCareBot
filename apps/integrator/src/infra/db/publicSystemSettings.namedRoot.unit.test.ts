import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';

const { runNamedRoot, runSql, runInfra } = vi.hoisted(() => ({
  runNamedRoot: vi.fn(),
  runSql: vi.fn(),
  runInfra: vi.fn((_principal: unknown, fn: () => unknown) => fn()),
}));

vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bersoncare/db-principal')>()),
  runWithDbInfraPrincipal: runInfra,
}));

vi.mock('./runIntegratorSql.js', () => ({
  runIntegratorNamedRoot: runNamedRoot,
  runIntegratorSql: runSql,
}));

import { fetchIntegratorRuntimeSettingValueJson } from './publicSystemSettings.js';

const db = {} as DbPort;

beforeEach(() => vi.clearAllMocks());

describe('integrator non-secret runtime setting root', () => {
  it('uses the single attested named root with the exact allowlisted key', async () => {
    runNamedRoot.mockResolvedValueOnce({ rows: [{ value_json: { value: 'Europe/Moscow' } }] });

    await expect(
      fetchIntegratorRuntimeSettingValueJson(db, 'app_display_timezone'),
    ).resolves.toEqual({ value: 'Europe/Moscow' });

    expect(runNamedRoot).toHaveBeenCalledTimes(1);
    expect(runInfra).toHaveBeenCalledWith(
      { source: 'integrator-server-runtime-config' },
      expect.any(Function),
    );
    expect(runNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
      'app.read_integrator_runtime_setting(text)',
      ['app_display_timezone'],
    ]);
    expect(runSql).not.toHaveBeenCalled();
  });
});
