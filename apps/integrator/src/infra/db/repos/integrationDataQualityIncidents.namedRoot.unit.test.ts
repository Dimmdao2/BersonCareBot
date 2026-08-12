import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';

const fakes = vi.hoisted(() => ({
  runNamedRoot: vi.fn(),
  runInfra: vi.fn((_principal: unknown, fn: () => unknown) => fn()),
}));

vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bersoncare/db-principal')>()),
  runWithDbInfraPrincipal: fakes.runInfra,
}));
vi.mock('../runIntegratorSql.js', () => ({ runIntegratorNamedRoot: fakes.runNamedRoot }));

import { upsertIntegrationDataQualityIncident } from './integrationDataQualityIncidents.js';

const db = {} as DbPort;

beforeEach(() => vi.clearAllMocks());

describe('data-quality incident exact root', () => {
  it('attests the complete dedup and evidence tuple and returns the occurrence count', async () => {
    fakes.runNamedRoot.mockResolvedValue({ rows: [{ occurrences: 2 }] });
    const incident = {
      integration: 'rubitime', entity: 'appointment', externalId: 'ext-1', field: 'recordAt',
      rawValue: 'bad-date', timezoneUsed: null, errorReason: 'invalid_datetime' as const,
    };

    await expect(upsertIntegrationDataQualityIncident(db, incident)).resolves.toEqual({ occurrences: 2 });
    expect(fakes.runInfra).toHaveBeenCalledWith({ source: 'integrator-data-quality' }, expect.any(Function));
    expect(fakes.runNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
      'app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text)',
      ['rubitime', 'appointment', 'ext-1', 'recordAt', 'bad-date', null, 'invalid_datetime'],
    ]);
  });
});
