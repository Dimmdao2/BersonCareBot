import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeMock, getDrizzleMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  getDrizzleMock: vi.fn(),
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: getDrizzleMock,
}));

import { createPgBroadcastEmailRecipientsPort } from './pgBroadcastEmailRecipients';

const pgDialect = new PgDialect();

describe('createPgBroadcastEmailRecipientsPort', () => {
  beforeEach(() => {
    executeMock.mockReset();
    getDrizzleMock.mockReset();
    getDrizzleMock.mockReturnValue({ execute: executeMock });
  });

  it('uses individually-bound UUIDs in IN and returns eligible email recipients', async () => {
    const firstId = '11111111-1111-4111-8111-111111111111';
    const secondId = '22222222-2222-4222-8222-222222222222';
    executeMock.mockResolvedValue({
      rows: [{ id: firstId, email_normalized: 'first@example.com' }],
    });

    const result = await createPgBroadcastEmailRecipientsPort().getVerifiedEmailsForUserIds([
      firstId,
      secondId,
    ]);

    const fragment = executeMock.mock.calls[0]?.[0] as SQL | undefined;
    expect(fragment).toBeDefined();
    const query = pgDialect.sqlToQuery(fragment!);
    expect(query.sql).toContain('WHERE id IN ($1::uuid, $2::uuid)');
    expect(query.sql).not.toContain('ANY(');
    expect(query.sql).not.toContain('::uuid[]');
    expect(query.params).toEqual([firstId, secondId]);
    expect(result).toEqual(new Map([[firstId, 'first@example.com']]));
  });
});
