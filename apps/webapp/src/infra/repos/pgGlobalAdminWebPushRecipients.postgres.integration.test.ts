import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { getPool } from '@/app-layer/db/client';
import { createPgGlobalAdminWebPushRecipientsPort } from './pgGlobalAdminWebPushRecipients';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

const IDS = {
  admin: '10000000-0000-4000-8000-000000000001',
  blocked: '10000000-0000-4000-8000-000000000002',
  archived: '10000000-0000-4000-8000-000000000003',
  merged: '10000000-0000-4000-8000-000000000004',
  doctor: '10000000-0000-4000-8000-000000000005',
  client: '10000000-0000-4000-8000-000000000006',
} as const;

describe('createPgGlobalAdminWebPushRecipientsPort', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO public.platform_users (id, display_name, role, is_blocked, is_archived, merged_into_id)
       VALUES
         ($1, 'active admin', 'admin', false, false, NULL),
         ($2, 'blocked admin', 'admin', true, false, NULL),
         ($3, 'archived admin', 'admin', false, true, NULL),
         ($5, 'doctor member', 'doctor', false, false, NULL),
         ($6, 'ordinary client', 'client', false, false, NULL),
         ($4, 'merged admin', 'admin', false, false, $1)`,
      [IDS.admin, IDS.blocked, IDS.archived, IDS.merged, IDS.doctor, IDS.client],
    );
  });

  afterAll(async () => {
    await pool.end();
    await getPool().end();
  });

  it('returns only active canonical platform admins', async () => {
    await expect(
      createPgGlobalAdminWebPushRecipientsPort().listActiveGlobalAdminUserIds(),
    ).resolves.toEqual([IDS.admin]);
  });
});
