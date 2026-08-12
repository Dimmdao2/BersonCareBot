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

import { createPostgresIdempotencyPort } from './idempotencyKeys.js';

const db = {} as DbPort;

beforeEach(() => vi.clearAllMocks());

describe('integrator idempotency exact roots', () => {
  it('attests the key and ttl for acquire and the exact key for release', async () => {
    fakes.runNamedRoot.mockResolvedValueOnce({ rows: [{ acquired: true }] }).mockResolvedValueOnce({ rows: [] });
    const port = createPostgresIdempotencyPort(db);

    await expect(port.tryAcquire('event:42', 60)).resolves.toBe(true);
    await port.release?.('event:42');

    expect(fakes.runInfra).toHaveBeenCalledTimes(2);
    expect(fakes.runInfra.mock.calls.map((call) => call[0])).toEqual([
      { source: 'integrator-idempotency' },
      { source: 'integrator-idempotency' },
    ]);
    expect(fakes.runNamedRoot.mock.calls.map((call) => call.slice(1, 3))).toEqual([
      ['app.try_acquire_integrator_idempotency(text,integer)', ['event:42', 60]],
      ['app.release_integrator_idempotency(text)', ['event:42']],
    ]);
  });
});
