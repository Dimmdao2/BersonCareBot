import { describe, expect, it } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  enqueueDirectPublicWriteRetry,
  type DirectPublicWriteRetryOperation,
} from './directPublicWriteRetry.js';

const ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001';

describe('enqueueDirectPublicWriteRetry', () => {
  it.each([
    'reminder_rule_upsert',
    'support_delivery_attempt_append',
    'reminder_occurrence_sent_record',
    'reminder_occurrence_failed_record',
    'reminder_occurrence_expired_record',
    'reminder_delivery_log_append',
    'content_access_grant_upsert',
  ] as const)('inserts an idempotent durable row for %s', async (operation) => {
    const calls: Array<{ text: string; params: unknown[] | undefined }> = [];
    const db: DbPort = {
      async query(text, params) {
        calls.push({ text, params });
        return { rows: [] };
      },
      async tx(fn) {
        return fn(this);
      },
    };
    const idempotencyKey = `direct-public-write:${operation}:entity-1`;
    const payload = { operation, entityId: 'entity-1' };

    await enqueueDirectPublicWriteRetry(db, {
      operation: operation as DirectPublicWriteRetryOperation,
      organizationId: ORGANIZATION_ID,
      idempotencyKey,
      payload: payload as never,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('INSERT INTO integrator.direct_public_write_retries');
    expect(calls[0]?.text).toContain('ON CONFLICT (idempotency_key) DO NOTHING');
    expect(calls[0]?.params).toEqual([
      operation,
      ORGANIZATION_ID,
      idempotencyKey,
      JSON.stringify(payload),
    ]);
  });
});
