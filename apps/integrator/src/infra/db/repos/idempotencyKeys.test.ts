import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  GATEWAY_IDEMPOTENCY_ALLOWED_TABLES,
  createInMemoryIdempotencyPort,
  createPostgresIdempotencyPort,
} from './idempotencyKeys.js';

function makeDb(query: ReturnType<typeof vi.fn>): DbPort {
  return { query, tx: vi.fn() } as unknown as DbPort;
}

describe('createInMemoryIdempotencyPort', () => {
  it('dedupes by key within TTL', async () => {
    const port = createInMemoryIdempotencyPort();
    expect(await port.tryAcquire('k1', 60)).toBe(true);
    expect(await port.tryAcquire('k1', 60)).toBe(false);
    await port.release!('k1');
    expect(await port.tryAcquire('k1', 60)).toBe(true);
  });
});

describe('createPostgresIdempotencyPort', () => {
  it('tryAcquire returns true when INSERT returns a row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ key: 'evt-1' }], rowCount: 1 });
    const port = createPostgresIdempotencyPort(makeDb(query));
    expect(await port.tryAcquire('evt-1', 30)).toBe(true);
    expect(String(query.mock.calls[0]?.[0])).toContain(GATEWAY_IDEMPOTENCY_ALLOWED_TABLES[0]);
  });

  it('tryAcquire returns false when conflict leaves no row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const port = createPostgresIdempotencyPort(makeDb(query));
    expect(await port.tryAcquire('evt-dup', 30)).toBe(false);
  });

  it('release deletes by key', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const port = createPostgresIdempotencyPort(makeDb(query));
    await port.release!('evt-1');
    expect(String(query.mock.calls[0]?.[0])).toContain('DELETE FROM idempotency_keys');
  });
});
