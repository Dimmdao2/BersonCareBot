import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  markOperatorIncidentAlertSent,
  operatorIncidentAlertAlreadySent,
  resolveOutgoingDeliveryScope,
} from './outgoingDeliveryScope.js';

function dbWithRows(rows: unknown[]): DbPort {
  return {
    query: vi.fn(async () => ({ rows })) as unknown as DbPort['query'],
    tx: vi.fn() as unknown as DbPort['tx'],
  };
}

describe('outgoing delivery narrow accessors', () => {
  it('normalizes a tenant scope returned by the resolver', async () => {
    const db = dbWithRows([{
      queue_kind: 'reminder_dispatch',
      organization_id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
      resolution: 'tenant',
    }]);
    await expect(resolveOutgoingDeliveryScope(db, '11111111-1111-4111-8111-111111111111')).resolves.toEqual({
      kind: 'tenant',
      queueKind: 'reminder_dispatch',
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  it('keeps operator health reads and writes behind narrow functions', async () => {
    const readDb = dbWithRows([{ already_sent: true }]);
    await expect(operatorIncidentAlertAlreadySent(readDb, '22222222-2222-4222-8222-222222222222')).resolves.toBe(true);
    expect(readDb.query).toHaveBeenCalledWith(
      'SELECT app.operator_incident_alert_already_sent($1::uuid) AS already_sent',
      ['22222222-2222-4222-8222-222222222222'],
    );
    const writeDb = dbWithRows([]);
    await markOperatorIncidentAlertSent(writeDb, '22222222-2222-4222-8222-222222222222');
    expect(writeDb.query).toHaveBeenCalledWith(
      'SELECT app.mark_operator_incident_alert_sent($1::uuid)',
      ['22222222-2222-4222-8222-222222222222'],
    );
  });
});
