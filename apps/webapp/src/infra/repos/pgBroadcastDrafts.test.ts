import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runWebappTransactionMock, txExecuteMock } = vi.hoisted(() => ({
  runWebappTransactionMock: vi.fn(),
  txExecuteMock: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappTransaction: (...args: unknown[]) => runWebappTransactionMock(...args),
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: vi.fn(),
}));

import { createPgBroadcastDraftPort } from './pgBroadcastDrafts';
import type { BroadcastDraft } from '@/modules/doctor-broadcasts/draftPort';

type TxExecutor = {
  execute: (fragment: SQL) => Promise<unknown>;
};

type TransactionCallback = (tx: TxExecutor) => Promise<void>;

const pgDialect = new PgDialect();

describe('createPgBroadcastDraftPort', () => {
  beforeEach(() => {
    runWebappTransactionMock.mockReset();
    txExecuteMock.mockReset();
    txExecuteMock.mockResolvedValue({ rows: [], rowCount: 1 });
    runWebappTransactionMock.mockImplementation(async (fn: TransactionCallback) =>
      fn({ execute: txExecuteMock as TxExecutor['execute'] }),
    );
  });

  it('saves draft through one webapp transaction using upsert SQL', async () => {
    const draft: BroadcastDraft = {
      category: 'reminder',
      audience: 'with_telegram',
      channels: ['bot_message', 'sms'],
      title: 'Заголовок',
      body: 'Текст рассылки',
      mediaUrl: null,
      mediaType: null,
    };

    const port = createPgBroadcastDraftPort();
    await port.saveDraft('11111111-1111-4111-8111-111111111111', draft);

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    expect(txExecuteMock).toHaveBeenCalledTimes(1);

    const fragment = txExecuteMock.mock.calls[0]?.[0] as SQL | undefined;
    expect(fragment).toBeDefined();
    const { sql: text } = pgDialect.sqlToQuery(fragment!);
    expect(text).toContain('INSERT INTO broadcast_drafts');
    expect(text).toContain('ON CONFLICT (doctor_user_id)');
  });
});
