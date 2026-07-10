import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { drizzleSqlFragmentToApproximateSql } from '../drizzleSqlDebugText.js';
import {
  findByPhone,
  getLinkDataByIdentity,
  getNotificationSettings,
  getUserLinkData,
  getUserState,
  resolveActiveOrganizationIdForIntegratorUserId,
  resolveActiveOrganizationIdForMessengerIdentity,
  resolveDeploymentSingleActiveOrganizationId,
  setUserPhone,
  setUserState,
  tryAdvanceLastUpdateId,
  tryConsumeStart,
  upsertUser,
  updateNotificationSettings,
} from './channelUsers.js';
import { resetIntegratorLinkedPhoneSourceCacheForTests } from './linkedPhoneSource.js';

function createDbMock() {
  const queryMock = vi.fn();
  const executeMock = vi.fn();
  const txMock = vi.fn();
  const db: DbPort = {
    query: queryMock as unknown as DbPort['query'],
    tx: txMock as unknown as DbPort['tx'],
    integratorDrizzle: { execute: executeMock } as DbPort['integratorDrizzle'],
  };
  return { db, query: queryMock, execute: executeMock };
}

function flatExec(execute: ReturnType<typeof createDbMock>['execute'], index: number): string {
  return drizzleSqlFragmentToApproximateSql(execute.mock.calls[index]?.[0]);
}

/** `getLinkDataByIdentity` / `getUserLinkData` always query `integrator_linked_phone_source` first. */
function mockDefaultLinkedPhoneStrategyQuery(query: ReturnType<typeof createDbMock>['query']) {
  query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as DbQueryResult);
}

function mockLinkedPhoneStrategyQuery(
  query: ReturnType<typeof createDbMock>['query'],
  strategy: 'public_only' | 'public_then_contacts' | 'contacts_only',
) {
  query.mockResolvedValueOnce({
    rows: [{ value_json: { value: strategy } }],
    rowCount: 1,
  } as DbQueryResult<{ value_json: unknown }>);
}

describe('channelUsers repo (identity/contact/state split)', () => {
  beforeEach(() => {
    resetIntegratorLinkedPhoneSourceCacheForTests();
  });

  it('resolves a single active organization from messenger identity bridge', async () => {
    const { db, execute } = createDbMock();
    execute.mockResolvedValueOnce({
      rows: [{ organization_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
      rowCount: 1,
    } as DbQueryResult<{ organization_id: string }>);

    const orgId = await resolveActiveOrganizationIdForMessengerIdentity(db, {
      resource: 'telegram',
      externalId: '123',
    });

    expect(orgId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const sqlText = flatExec(execute, 0);
    expect(sqlText).toContain('FROM integrator.identities');
    expect(sqlText).toContain('identity_row.resource = telegram');
    expect(sqlText).toContain('identity_row.external_id = 123');
    expect(sqlText).toContain('public.platform_users');
    expect(sqlText).toContain('platform_user.integrator_user_id = identity_user.user_id');
    expect(sqlText).toContain('public.org_enrollments');
    expect(sqlText).toContain('public.be_organization_members');
    expect(sqlText).toContain("status = 'active'");
    expect(sqlText).toContain('LIMIT 2');
    expect(sqlText).not.toContain('a0000000-0000-4000-8000-000000000001');
  });

  it('keeps messenger identity organization context unset when no active org exists', async () => {
    const { db, execute } = createDbMock();
    execute.mockResolvedValueOnce({ rows: [], rowCount: 0 } as DbQueryResult<{ organization_id: string }>);

    const orgId = await resolveActiveOrganizationIdForMessengerIdentity(db, {
      resource: 'max',
      externalId: '456',
    });

    expect(orgId).toBeNull();
  });

  it('keeps messenger identity organization context unset for multi-org users', async () => {
    const { db, execute } = createDbMock();
    execute.mockResolvedValueOnce({
      rows: [
        { organization_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        { organization_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      ],
      rowCount: 2,
    } as DbQueryResult<{ organization_id: string }>);

    const orgId = await resolveActiveOrganizationIdForMessengerIdentity(db, {
      resource: 'telegram',
      externalId: '123',
    });

    expect(orgId).toBeNull();
  });

  it('resolves a single active organization from direct integrator user id', async () => {
    const { db, execute } = createDbMock();
    execute.mockResolvedValueOnce({
      rows: [{ organization_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }],
      rowCount: 1,
    } as DbQueryResult<{ organization_id: string }>);

    const orgId = await resolveActiveOrganizationIdForIntegratorUserId(db, '42');

    expect(orgId).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    const sqlText = flatExec(execute, 0);
    expect(sqlText).toContain('platform_user.integrator_user_id = 42::bigint');
    expect(sqlText).toContain('public.org_enrollments');
    expect(sqlText).toContain('public.be_organization_members');
    expect(sqlText).toContain('LIMIT 2');
  });

  describe('T0.4 deployment channel-binding fallback', () => {
    it('resolves the deployment single organization when exactly one exists', async () => {
      const { db, execute } = createDbMock();
      execute.mockResolvedValueOnce({
        rows: [{ organization_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }],
        rowCount: 1,
      } as DbQueryResult<{ organization_id: string }>);

      const orgId = await resolveDeploymentSingleActiveOrganizationId(db);

      expect(orgId).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
      const sqlText = flatExec(execute, 0);
      expect(sqlText).toContain('FROM public.be_organizations');
      expect(sqlText).toContain('is_active = true');
      expect(sqlText).toContain('LIMIT 2');
    });

    it('filters by is_active so a deactivated organization never counts toward the single-org resolution', async () => {
      // Regression for a defect where `ORDER BY id LIMIT 2` ignored `is_active`: 1 active + 1
      // deactivated org would return 2 rows and resolve to null (silently disabling the fallback)
      // instead of resolving the one active org. The `WHERE is_active = true` filter means
      // Postgres itself only ever returns active rows here — simulate that filtered result.
      const { db, execute } = createDbMock();
      execute.mockResolvedValueOnce({
        rows: [{ organization_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }],
        rowCount: 1,
      } as DbQueryResult<{ organization_id: string }>);

      const orgId = await resolveDeploymentSingleActiveOrganizationId(db);

      expect(orgId).toBe('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
      const sqlText = flatExec(execute, 0);
      expect(sqlText).toContain('is_active = true');
    });

    it('resolves null (not the deactivated row) when the only organization is deactivated', async () => {
      // With the is_active filter, a deployment holding a single *deactivated* org returns zero
      // rows from Postgres — never the deactivated org's id.
      const { db, execute } = createDbMock();
      execute.mockResolvedValueOnce({ rows: [], rowCount: 0 } as DbQueryResult<{ organization_id: string }>);

      const orgId = await resolveDeploymentSingleActiveOrganizationId(db);

      expect(orgId).toBeNull();
    });

    it('returns null when zero or more than one organization exists (no single deployment org inferable)', async () => {
      const { db, execute } = createDbMock();
      execute.mockResolvedValueOnce({ rows: [], rowCount: 0 } as DbQueryResult<{ organization_id: string }>);
      expect(await resolveDeploymentSingleActiveOrganizationId(db)).toBeNull();

      execute.mockResolvedValueOnce({
        rows: [
          { organization_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
          { organization_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
        ],
        rowCount: 2,
      } as DbQueryResult<{ organization_id: string }>);
      expect(await resolveDeploymentSingleActiveOrganizationId(db)).toBeNull();
    });

    it('fails open (returns null) when the query throws', async () => {
      const { db, execute } = createDbMock();
      execute.mockRejectedValueOnce(new Error('db down'));
      await expect(resolveDeploymentSingleActiveOrganizationId(db)).resolves.toBeNull();
    });
  });

  it('upsertUser uses canonical identities and telegram_state only', async () => {
    const { db, execute } = createDbMock();
    execute.mockResolvedValueOnce({
      rows: [{ id: '42', channel_id: '123' }],
      rowCount: 1,
    } as DbQueryResult<{ id: string; channel_id: string }>);

    const row = await upsertUser(db, {
      id: 123,
      username: 'alice',
      first_name: 'Alice',
      last_name: 'Example',
    });

    expect(row).toEqual({ id: '42', channel_id: '123' });
    expect(execute).toHaveBeenCalledTimes(1);
    const sqlText = flatExec(execute, 0);
    expect(sqlText).toContain('INSERT INTO identities');
    expect(sqlText).toContain('INSERT INTO telegram_state');
    expect(sqlText).toContain('INSERT INTO users');
    expect(sqlText).not.toContain('INSERT INTO telegram_users');
    expect(sqlText).toContain('123');
    expect(sqlText).toContain('alice');
  });

  it('set/get state operate via telegram_state joined with identities', async () => {
    const { db, execute } = createDbMock();
    execute.mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult);
    await setUserState(db, '123', 'idle');

    const setSql = flatExec(execute, 0);
    expect(setSql).toContain('INSERT INTO telegram_state');
    expect(setSql).toContain('FROM identities i');
    expect(setSql).not.toContain('UPDATE telegram_users');

    execute.mockResolvedValueOnce({
      rows: [{ state: 'idle' }],
      rowCount: 1,
    } as DbQueryResult<{ state: string | null }>);
    const state = await getUserState(db, '123');
    expect(state).toBe('idle');

    const getSql = flatExec(execute, 1);
    expect(getSql).toContain('LEFT JOIN telegram_state');
    expect(getSql).toContain('i.resource = telegram');
  });

  it('setUserPhone writes canonical contact only', async () => {
    const { db, execute } = createDbMock();
    execute
      .mockResolvedValueOnce({
        rows: [{ user_id: '7' }],
        rowCount: 1,
      } as DbQueryResult<{ user_id: string }>)
      .mockResolvedValueOnce({
        rows: [{ merged_into_user_id: null }],
        rowCount: 1,
      } as DbQueryResult<{ merged_into_user_id: string | null }>)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as DbQueryResult)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult);

    await expect(setUserPhone(db, '123', '+79990001122')).resolves.toBe('applied');

    expect(flatExec(execute, 0)).toContain('FROM identities i');
    expect(flatExec(execute, 0)).toContain('123');
    expect(flatExec(execute, 0)).toContain('telegram');

    expect(flatExec(execute, 2)).toContain('DELETE FROM contacts');

    const insSql = flatExec(execute, 3);
    expect(insSql).toContain('INSERT INTO contacts');
    expect(insSql).toContain('organization_id');
    expect(insSql).toContain('public.platform_users');
    expect(insSql).toContain('public.org_enrollments');
    expect(insSql).toContain('public.be_organization_members');
    expect(insSql).toContain('count(DISTINCT active_user_orgs.organization_id) = 1');
    expect(insSql).toContain('::bigint');
    expect(insSql).toContain('WHERE contacts.user_id = ');
    expect(insSql).toContain('organization_id = COALESCE(EXCLUDED.organization_id, contacts.organization_id)');
    expect(insSql).not.toContain('UPDATE telegram_users');
    expect(insSql).toContain('7');
    expect(insSql).toContain('+79990001122');
    expect(insSql).toContain('telegram');
  });

  it('setUserPhone ON CONFLICT only updates when contact belongs to same canonical user (no takeover)', async () => {
    const { db, execute } = createDbMock();
    execute
      .mockResolvedValueOnce({
        rows: [{ user_id: '42' }],
        rowCount: 1,
      } as DbQueryResult<{ user_id: string }>)
      .mockResolvedValueOnce({
        rows: [{ merged_into_user_id: null }],
        rowCount: 1,
      } as DbQueryResult<{ merged_into_user_id: string | null }>)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as DbQueryResult)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as DbQueryResult);

    await expect(setUserPhone(db, '456', '+79990001122')).resolves.toBe('noop_conflict');

    const insSql = flatExec(execute, 3);
    expect(insSql).toContain('ON CONFLICT (type, value_normalized)');
    expect(insSql).toContain('WHERE contacts.user_id = ');
  });

  it('setUserPhone follows merged_into_user_id so contact attaches to winner', async () => {
    const { db, execute } = createDbMock();
    execute
      .mockResolvedValueOnce({
        rows: [{ user_id: '2' }],
        rowCount: 1,
      } as DbQueryResult<{ user_id: string }>)
      .mockResolvedValueOnce({
        rows: [{ merged_into_user_id: '100' }],
        rowCount: 1,
      } as DbQueryResult<{ merged_into_user_id: string | null }>)
      .mockResolvedValueOnce({
        rows: [{ merged_into_user_id: null }],
        rowCount: 1,
      } as DbQueryResult<{ merged_into_user_id: string | null }>)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as DbQueryResult)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult);

    await expect(setUserPhone(db, '999', '+79990001122')).resolves.toBe('applied');

    expect(flatExec(execute, 4)).toContain('100');
  });

  it('notification settings and dedup fields read/write through telegram_state', async () => {
    const { db, execute } = createDbMock();

    execute.mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult);
    await updateNotificationSettings(db, 123, { notify_spb: true, notify_online: false });
    const updateSql = flatExec(execute, 0);
    expect(updateSql).toContain('INSERT INTO telegram_state');
    expect(updateSql).toContain('ON CONFLICT (identity_id)');
    expect(updateSql).not.toContain('UPDATE telegram_users');

    execute.mockResolvedValueOnce({
      rows: [{ notify_spb: true, notify_msk: false, notify_online: false, notify_bookings: false }],
      rowCount: 1,
    } as DbQueryResult<{
      notify_spb: boolean | null;
      notify_msk: boolean | null;
      notify_online: boolean | null;
      notify_bookings: boolean | null;
    }>);
    const settings = await getNotificationSettings(db, 123);
    expect(settings).toEqual({ notify_spb: true, notify_msk: false, notify_online: false, notify_bookings: false });

    execute.mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult);
    const advanced = await tryAdvanceLastUpdateId(db, 123, 1001);
    expect(advanced).toBe(true);

    const advanceSql = flatExec(execute, 2);
    expect(advanceSql).toContain('UPDATE telegram_state ts');
    expect(advanceSql).toContain('last_update_id');
  });

  it('lookup helpers resolve via contacts + identities + telegram_state', async () => {
    const { db, query, execute } = createDbMock();
    execute.mockResolvedValueOnce({
      rows: [{ channel_id: '123', username: 'alice' }],
      rowCount: 1,
    } as DbQueryResult<{ channel_id: string; username: string | null }>);

    const byPhone = await findByPhone(db, '+79990001122');
    expect(byPhone).toEqual({ chatId: 123, channelId: '123', username: 'alice' });

    const findSqlText = flatExec(execute, 0);
    expect(findSqlText).toContain('FROM contacts c');
    expect(findSqlText).toContain('JOIN identities i');
    expect(findSqlText).toContain('LEFT JOIN telegram_state ts');

    mockDefaultLinkedPhoneStrategyQuery(query);
    execute.mockResolvedValueOnce({
      rows: [
        {
          channel_id: '123',
          username: 'alice',
          user_state: 'idle',
          pub_phone: '+79990001122',
          legacy_contact_phone: null,
        },
      ],
      rowCount: 1,
    } as DbQueryResult<{
      channel_id: string;
      username: string | null;
      user_state: string | null;
      pub_phone: string | null;
      legacy_contact_phone: string | null;
    }>);

    const byChannel = await getUserLinkData(db, '123');
    expect(byChannel).toEqual({
      chatId: 123,
      channelId: '123',
      username: 'alice',
      phoneNormalized: '+79990001122',
      userState: 'idle',
    });

    const linkSqlText = flatExec(execute, 1);
    expect(linkSqlText).toContain('FROM identities i');
    expect(linkSqlText).toContain('public.user_channel_bindings');
    expect(linkSqlText).toContain('public.platform_users');
    expect(linkSqlText).toContain('LEFT JOIN LATERAL');
    expect(linkSqlText).toContain('FROM contacts c');
    expect(linkSqlText).toContain('telegram');
  });

  it('getLinkDataByIdentity uses public canon phone when integrator contact is empty', async () => {
    const { db, query, execute } = createDbMock();
    mockDefaultLinkedPhoneStrategyQuery(query);
    execute.mockResolvedValueOnce({
      rows: [
        {
          user_id: '7',
          channel_id: '555',
          username: 'bob',
          user_state: 'idle',
          pub_phone: '+79991112233',
          legacy_contact_phone: null,
        },
      ],
      rowCount: 1,
    } as DbQueryResult);

    const row = await getLinkDataByIdentity(db, 'telegram', '555');
    expect(row?.phoneNormalized).toBe('+79991112233');
    const sqlText = flatExec(execute, 0);
    // eslint-disable-next-line no-secrets/no-secrets -- asserts SQL shape, not a secret
    expect(sqlText).toContain('NULLIF(TRIM(pub.phone_normalized');
    expect(sqlText).toContain('legacy_contact_phone');
  });

  it('getLinkDataByIdentity (max) uses public bindings + telegram_state for runtime state', async () => {
    const { db, query, execute } = createDbMock();
    mockDefaultLinkedPhoneStrategyQuery(query);
    execute.mockResolvedValueOnce({
      rows: [
        {
          user_id: '3',
          channel_id: '999',
          user_state: 'admin_reply:webapp:platform:u#pn:item-1',
          pub_phone: '+79990000000',
          legacy_contact_phone: null,
        },
      ],
      rowCount: 1,
    } as DbQueryResult);

    const row = await getLinkDataByIdentity(db, 'max', '999');
    expect(row?.phoneNormalized).toBe('+79990000000');
    expect(row?.username).toBeNull();
    expect(row?.userState).toBe('admin_reply:webapp:platform:u#pn:item-1');
    const sqlText = flatExec(execute, 0);
    expect(sqlText).toContain('public.user_channel_bindings');
    expect(sqlText).toContain('pub_phone');
    expect(sqlText).toContain('legacy_contact_phone');
    expect(sqlText).toContain('max');
    expect(sqlText).toContain('telegram_state');
  });

  it('setUserState (max) targets max identity in telegram_state', async () => {
    const { db, execute } = createDbMock();
    execute.mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult);
    await setUserState(db, '999', 'admin_reply:test', 'max');

    const setSql = flatExec(execute, 0);
    expect(setSql).toContain('INSERT INTO telegram_state');
    expect(setSql).toContain('i.resource = max');
  });

  it('getLinkDataByIdentity returns null phone when neither public nor labeled contact has a number', async () => {
    const { db, query, execute } = createDbMock();
    mockDefaultLinkedPhoneStrategyQuery(query);
    execute.mockResolvedValueOnce({
      rows: [
        {
          user_id: '1',
          channel_id: '1',
          username: 'u',
          user_state: 'idle',
          pub_phone: null,
          legacy_contact_phone: null,
        },
      ],
      rowCount: 1,
    } as DbQueryResult);

    const row = await getLinkDataByIdentity(db, 'telegram', '1');
    expect(row?.userId).toBe('1');
    expect(row?.phoneNormalized).toBeNull();
  });

  it('getLinkDataByIdentity falls back to integrator contact when public has no phone yet', async () => {
    const { db, query, execute } = createDbMock();
    mockDefaultLinkedPhoneStrategyQuery(query);
    execute.mockResolvedValueOnce({
      rows: [
        {
          user_id: '1',
          channel_id: '1',
          username: null,
          user_state: null,
          pub_phone: null,
          legacy_contact_phone: '+79997776655',
        },
      ],
      rowCount: 1,
    } as DbQueryResult);

    const row = await getLinkDataByIdentity(db, 'telegram', '1');
    expect(row?.phoneNormalized).toBe('+79997776655');
  });

  it('getLinkDataByIdentity public_only ignores legacy contact when public is empty', async () => {
    const { db, query, execute } = createDbMock();
    mockLinkedPhoneStrategyQuery(query, 'public_only');
    execute.mockResolvedValueOnce({
      rows: [
        {
          user_id: '1',
          channel_id: '1',
          username: null,
          user_state: null,
          pub_phone: null,
          legacy_contact_phone: '+79997776655',
        },
      ],
      rowCount: 1,
    } as DbQueryResult);

    const row = await getLinkDataByIdentity(db, 'telegram', '1');
    expect(row?.phoneNormalized).toBeNull();
  });

  describe('tryConsumeStart', () => {
    it('returns true when UPDATE succeeds (slot consumed)', async () => {
      const { db, execute } = createDbMock();
      execute.mockResolvedValueOnce({ rows: [{ identity_id: '1' }], rowCount: 1 } as DbQueryResult);
      await expect(tryConsumeStart(db, 42)).resolves.toBe(true);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('returns false only when identity exists and last_start_at is inside debounce window', async () => {
      const { db, execute } = createDbMock();
      execute
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as DbQueryResult)
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 } as DbQueryResult);
      await expect(tryConsumeStart(db, 42)).resolves.toBe(false);
      expect(execute).toHaveBeenCalledTimes(2);
    });

    it('returns true when no identity/state (e.g. after purge) so /start is not swallowed', async () => {
      const { db, execute } = createDbMock();
      execute
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as DbQueryResult)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as DbQueryResult);
      await expect(tryConsumeStart(db, 42)).resolves.toBe(true);
      expect(execute).toHaveBeenCalledTimes(2);
    });
  });
});
