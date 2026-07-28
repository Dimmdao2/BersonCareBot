/* eslint-disable no-secrets/no-secrets -- test suite and accessor identifiers are not credentials */
import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { listSchedulerReminderOrganizationIds } from './schedulerReminderOrganizations.js';

function dbWithRows(rows: Array<{ organization_id: string }>): DbPort {
  return {
    query: vi.fn(async () => ({ rows })) as unknown as DbPort['query'],
    tx: vi.fn() as unknown as DbPort['tx'],
  };
}

describe('listSchedulerReminderOrganizationIds', () => {
  it('reads only through the narrow scheduler discovery accessor', async () => {
    const db = dbWithRows([
      { organization_id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' },
      { organization_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    ]);

    await expect(listSchedulerReminderOrganizationIds(db)).resolves.toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
    expect(db.query).toHaveBeenCalledWith(
      'SELECT organization_id::text AS organization_id FROM app.list_scheduler_reminder_organization_ids() AS scheduler_organizations(organization_id)',
    );
  });

  it('fails closed when discovery returns an invalid organization id', async () => {
    await expect(
      listSchedulerReminderOrganizationIds(dbWithRows([{ organization_id: 'invalid' }])),
    ).rejects.toThrow('invalid organization id');
  });
});
