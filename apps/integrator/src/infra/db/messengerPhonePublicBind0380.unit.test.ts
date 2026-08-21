/**
 * D15b/6 audit MF-2: messenger phone bind writes the canonical contact before retaining history.
 */
import { describe, expect, it } from 'vitest';
import { applyMessengerPhonePublicBind, type MessengerPhoneBindDb } from '@bersoncare/platform-merge';

const PHONE = '+79180000022';
const CHANNEL = 'telegram';
const EXTERNAL = 'ext-0380';
const BIND_USER = 'pu-bind';
const INTEGRATOR_ID = '1000';

type PlatformUserRow = {
  id: string;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  merged_into_id: string | null;
};

type UserContactRow = {
  platform_user_id: string;
  contact_kind: string;
  channel_code: string | null;
  value_normalized: string;
  is_primary: boolean;
};

type BindingRow = { channel_code: string; external_id: string; user_id: string };

type PhoneHistoryRow = {
  platform_user_id: string;
  phone_normalized: string;
  valid_to: string | null;
  source: string;
};

type State = {
  platformUsers: PlatformUserRow[];
  userContacts: UserContactRow[];
  bindings: BindingRow[];
  phoneHistory: PhoneHistoryRow[];
};

const norm = (s: string): string =>
  s.replace(/\s+/g, ' ').trim().toLowerCase().replaceAll('public.', '');

function makeDb(state: State) {
  const statements: string[] = [];

  const query = async (text: string, params: unknown[] = []) => {
    const q = norm(text);
    statements.push(q);
    const p = params.map((v) => (v == null ? null : String(v)));
    const at = (i: number): string | null => p[i] ?? null;

    if (q.includes('from user_channel_bindings ucb')) {
      const hit = state.bindings.find((b) => b.channel_code === p[0] && b.external_id === p[1]);
      const pu = hit
        ? state.platformUsers.find((u) => u.id === hit.user_id && u.merged_into_id === null)
        : undefined;
      return { rows: pu ? [{ platform_user_id: pu.id }] : [], rowCount: pu ? 1 : 0 };
    }

    if (q.includes('from user_contacts uc') && q.includes("contact_kind = 'phone'")) {
      const hits = state.userContacts
        .filter(
          (uc) =>
            uc.contact_kind === 'phone' &&
            uc.value_normalized === p[0] &&
            uc.platform_user_id !== p[1],
        )
        .map((uc) => {
          const pu = state.platformUsers.find(
            (u) => u.id === uc.platform_user_id && u.merged_into_id === null,
          );
          return pu ? { id: pu.id } : null;
        })
        .filter(Boolean);
      return { rows: hits.slice(0, 1), rowCount: hits.length > 0 ? 1 : 0 };
    }

    if (q.startsWith('select value_normalized as phone_normalized from user_contacts')) {
      const hit = state.userContacts.find(
        (contact) =>
          contact.platform_user_id === p[0] &&
          contact.contact_kind === 'phone' &&
          contact.is_primary,
      );
      return {
        rows: hit ? [{ phone_normalized: hit.value_normalized }] : [],
        rowCount: hit ? 1 : 0,
      };
    }

    if (q.includes('from platform_users')) {
      const live = state.platformUsers.filter((u) => u.merged_into_id === null);
      if (q.includes('existing_int_uid')) {
        const hit = live.find((u) => u.id === p[0]);
        return { rows: hit ? [{ existing_int_uid: hit.integrator_user_id }] : [], rowCount: hit ? 1 : 0 };
      }
      if (q.includes('phone_normalized = $1') && q.includes('id <> $2')) {
        const hit = live.filter((u) => u.phone_normalized === p[0] && u.id !== p[1]);
        return { rows: hit.map((u) => ({ id: u.id })), rowCount: hit.length };
      }
      if (q.includes('integrator_user_id = $1') && q.includes('id <> $2')) {
        const hit = live.filter((u) => u.integrator_user_id === p[0] && u.id !== p[1]);
        return { rows: hit.map((u) => ({ id: u.id })), rowCount: hit.length };
      }
      const hit = live.find((u) => u.id === p[0]);
      return {
        rows: hit
          ? [
              {
                id: hit.id,
                phone_normalized: hit.phone_normalized,
                integrator_user_id: hit.integrator_user_id,
                created_at: new Date('2026-01-01T00:00:00.000Z'),
              },
            ]
          : [],
        rowCount: hit ? 1 : 0,
      };
    }

    if (q.startsWith('update user_phone_history')) {
      for (const h of state.phoneHistory) {
        if (h.platform_user_id === p[0] && h.valid_to === null) h.valid_to = 'closed';
      }
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith('insert into user_phone_history')) {
      state.phoneHistory.push({
        platform_user_id: p[0]!,
        phone_normalized: p[1]!,
        valid_to: null,
        source: p[2] ?? 'messenger',
      });
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('update platform_users') && q.includes('phone_normalized = $2')) {
      const hit = state.platformUsers.find((u) => u.id === p[0] && u.merged_into_id === null);
      if (!hit) return { rows: [], rowCount: 0 };
      hit.phone_normalized = at(1);
      if (hit.integrator_user_id === null) hit.integrator_user_id = at(2);
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('update platform_users') && q.includes('integrator_user_id = coalesce')) {
      const hit = state.platformUsers.find((u) => u.id === p[1] && u.merged_into_id === null);
      if (!hit) return { rows: [], rowCount: 0 };
      if (hit.integrator_user_id === null) hit.integrator_user_id = at(0);
      return { rows: [], rowCount: 1 };
    }

    if (
      q.startsWith('update platform_users') &&
      q.includes('phone_normalized = $1') &&
      q.includes('patient_phone_trust_at') &&
      q.includes('id = $3')
    ) {
      const hit = state.platformUsers.find((u) => u.id === p[2] && u.merged_into_id === null);
      if (!hit) return { rows: [], rowCount: 0 };
      hit.phone_normalized = at(0);
      if (hit.integrator_user_id === null) hit.integrator_user_id = at(1);
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('delete from user_contacts')) {
      const before = state.userContacts.length;
      state.userContacts = state.userContacts.filter((uc) => uc.platform_user_id !== p[0]);
      return { rows: [], rowCount: before - state.userContacts.length };
    }

    if (q.startsWith('insert into user_contacts')) {
      const pu = state.platformUsers.find((u) => u.id === p[0] && u.merged_into_id === null);
      if (!pu?.phone_normalized) return { rows: [], rowCount: 0 };
      const conflict = state.userContacts.find(
        (uc) => uc.contact_kind === 'phone' && uc.value_normalized === pu.phone_normalized,
      );
      if (conflict && conflict.platform_user_id !== pu.id) {
        const err = Object.assign(new Error('uq_user_contacts_phone'), {
          code: '23505',
          constraint: 'uq_user_contacts_phone',
        });
        throw err;
      }
      state.userContacts = state.userContacts.filter((uc) => uc.platform_user_id !== pu.id);
      state.userContacts.push({
        platform_user_id: pu.id,
        contact_kind: 'phone',
        channel_code: null,
        value_normalized: pu.phone_normalized,
        is_primary: true,
      });
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('with existing_value as materialized')) {
      const platformUserId = p.find((value) => value === BIND_USER);
      const phone = p.find((value) => value === PHONE);
      if (!platformUserId || !phone) return { rows: [], rowCount: 0 };
      const conflict = state.userContacts.find(
        (contact) =>
          contact.contact_kind === 'phone' &&
          contact.value_normalized === phone &&
          contact.platform_user_id !== platformUserId,
      );
      if (conflict) return { rows: [], rowCount: 0 };
      state.userContacts = state.userContacts.map((contact) =>
        contact.platform_user_id === platformUserId && contact.contact_kind === 'phone'
          ? { ...contact, is_primary: false }
          : contact,
      );
      const current = state.userContacts.find(
        (contact) =>
          contact.platform_user_id === platformUserId &&
          contact.contact_kind === 'phone' &&
          contact.value_normalized === phone,
      );
      if (current) current.is_primary = true;
      else {
        state.userContacts.push({
          platform_user_id: platformUserId,
          contact_kind: 'phone',
          channel_code: null,
          value_normalized: phone,
          is_primary: true,
        });
      }
      return { rows: [{ id: 'contact-1' }], rowCount: 1 };
    }

    throw new Error(`unexpected query: ${q}`);
  };

  return { query, statements };
}

describe('D15b/6 MF-2 — applyMessengerPhonePublicBind canonical contact write', () => {
  it('writes user_contacts without rebuilding it from platform_users', async () => {
    const state: State = {
      platformUsers: [
        { id: BIND_USER, phone_normalized: null, integrator_user_id: INTEGRATOR_ID, merged_into_id: null },
      ],
      userContacts: [],
      bindings: [{ channel_code: CHANNEL, external_id: EXTERNAL, user_id: BIND_USER }],
      phoneHistory: [],
    };
    const db = makeDb(state);

    const result = await applyMessengerPhonePublicBind(db as MessengerPhoneBindDb, {
      channelCode: CHANNEL,
      externalId: EXTERNAL,
      phoneNormalized: PHONE,
      canonicalIntegratorUserId: INTEGRATOR_ID,
    });

    expect(result).toEqual({ platformUserId: BIND_USER });
    expect(state.platformUsers[0]!.phone_normalized).toBeNull();
    expect(state.userContacts).toEqual([
      {
        platform_user_id: BIND_USER,
        contact_kind: 'phone',
        channel_code: null,
        value_normalized: PHONE,
        is_primary: true,
      },
    ]);
    expect(state.phoneHistory).toEqual([
      {
        platform_user_id: BIND_USER,
        phone_normalized: PHONE,
        valid_to: null,
        source: 'messenger',
      },
    ]);
    expect(db.statements.some((statement) => statement.includes('user_oauth_bindings'))).toBe(
      false,
    );
  });
});
