import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({
  env: { DATABASE_URL: 'postgres://test/bersoncarebot_test' },
  webappRuntimeDatabaseIsConfigured: () => true,
}));

import { bindOAuthUserResolvePort, type OAuthUserResolvePort } from '@/modules/auth/oauthUserResolvePort';
import type { OAuthBindingsPort } from '@/modules/auth/oauthBindingsPort';
import { resolveUserIdForVkOAuth } from '@/modules/auth/oauthVkResolve';

/**
 * IDENTITY_AND_MERGE_SCHEME.md §1 + §2a — behavioral fake of the two ports
 * `resolveUserIdForVkOAuth` talks to. Mirrors `oauthWebLoginResolve.unit.test.ts`'s fake world, but
 * VK (like Yandex) has no separate `emailVerified` flag: whatever VK ID hands back is trusted
 * unconditionally (§1 — VK ID only ever returns a phone/email it already confirmed at binding
 * time), so there is no "unverified provider email" case to cover here.
 */
type FakeAccount = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  bindings: Array<{ provider: string; providerUserId: string; email: string | null }>;
};

function createFakeOAuthWorld() {
  const accounts = new Map<string, FakeAccount>();
  let nextId = 0;

  const oauthBindingsPort: OAuthBindingsPort = {
    async listProvidersForUser(userId) {
      const acc = accounts.get(userId);
      return (acc?.bindings.map((b) => b.provider) ?? []) as Awaited<
        ReturnType<OAuthBindingsPort['listProvidersForUser']>
      >;
    },
    async findUserByOAuthId(provider, providerUserId) {
      for (const acc of accounts.values()) {
        if (acc.bindings.some((b) => b.provider === provider && b.providerUserId === providerUserId)) {
          return { userId: acc.id };
        }
      }
      return null;
    },
  };

  const resolvePort: OAuthUserResolvePort = {
    async findCanonicalUserIdByPhone(phoneNorm) {
      for (const acc of accounts.values()) if (acc.phone === phoneNorm) return acc.id;
      return null;
    },
    async resolveCanonicalUserId(userId) {
      return accounts.has(userId) ? userId : null;
    },
    async applyVerifiedOAuthEmail(userId, emailRaw, emailTrusted) {
      if (!emailTrusted || !emailRaw?.trim()) return;
      const acc = accounts.get(userId);
      if (!acc) return;
      const email = emailRaw.trim();
      if (acc.email == null) {
        acc.email = email;
        acc.emailVerified = true;
        return;
      }
      if (!acc.emailVerified && acc.email.toLowerCase() === email.toLowerCase()) {
        acc.emailVerified = true;
      }
    },
    async findUserIdsByVerifiedEmail(emailNorm) {
      return [...accounts.values()]
        .filter((a) => a.emailVerified && a.email?.toLowerCase() === emailNorm)
        .map((a) => a.id);
    },
    async findActiveUserIdsByEmail(emailNorm) {
      return [...accounts.values()].filter((a) => a.email?.toLowerCase() === emailNorm).map((a) => a.id);
    },
    async findUserIdsByAnyConfirmedEmail(emailNorm) {
      const ids = new Set<string>();
      for (const acc of accounts.values()) {
        if (acc.email?.toLowerCase() === emailNorm) ids.add(acc.id);
        if (acc.bindings.some((b) => b.email?.toLowerCase() === emailNorm)) ids.add(acc.id);
      }
      return [...ids];
    },
    async getActivePhoneForUser(userId) {
      return accounts.get(userId)?.phone ?? null;
    },
    async addSparePhoneContact(userId, phoneNorm) {
      const acc = accounts.get(userId);
      if (acc) acc.phone = phoneNorm;
    },
    async createOAuthPlatformUser(input) {
      const id = `user-${++nextId}`;
      accounts.set(id, {
        id,
        email: input.emailRaw,
        emailVerified: Boolean(input.emailVerifiedAt),
        phone: input.phoneNorm,
        bindings: [],
      });
      return id;
    },
    async upsertOAuthBinding(input) {
      const acc = accounts.get(input.userId);
      if (!acc) return { inserted: false };
      acc.bindings.push({ provider: input.provider, providerUserId: input.providerUserId, email: input.emailRaw });
      return { inserted: true };
    },
  };

  function seed(acc: Partial<FakeAccount> & { id: string }): FakeAccount {
    const full: FakeAccount = { email: null, emailVerified: false, phone: null, bindings: [], ...acc };
    accounts.set(full.id, full);
    return full;
  }

  return { accounts, oauthBindingsPort, resolvePort, seed };
}

function loginInput(overrides: Partial<Parameters<typeof resolveUserIdForVkOAuth>[1]> = {}) {
  return { vkId: 'vk-1', email: null, displayName: 'Anna', phone: null, ...overrides };
}

describe('resolveUserIdForVkOAuth — IDENTITY_AND_MERGE_SCHEME.md §1 + §2a', () => {
  let world: ReturnType<typeof createFakeOAuthWorld>;

  beforeEach(() => {
    world = createFakeOAuthWorld();
    bindOAuthUserResolvePort(world.resolvePort);
  });

  it('case 1: VK email matches an existing account (first time via VK) -> logs in and confirms the address', async () => {
    world.seed({ id: 'acc-1', email: 'anna@mail.ru', emailVerified: true });
    const result = await resolveUserIdForVkOAuth(world.oauthBindingsPort, {
      ...loginInput(),
      email: 'anna@mail.ru',
    });
    expect(result).toEqual({ ok: true, userId: 'acc-1', accountOutcome: 'linked_existing' });
    expect(world.accounts.get('acc-1')?.bindings).toEqual([
      { provider: 'vk', providerUserId: 'vk-1', email: 'anna@mail.ru' },
    ]);
  });

  it('case 2: neither contact is registered anywhere -> creates a new account', async () => {
    const result = await resolveUserIdForVkOAuth(world.oauthBindingsPort, {
      ...loginInput(),
      email: 'brandnew@mail.ru',
    });
    expect(result.ok).toBe(true);
    expect(world.accounts.size).toBe(1);
  });

  it('case 3/5: phone matches an account with a DIFFERENT primary email -> new email stored as confirmed secondary, primary untouched', async () => {
    world.seed({ id: 'acc-1', phone: '+79990000001', email: 'old@mail.ru', emailVerified: true });
    const result = await resolveUserIdForVkOAuth(world.oauthBindingsPort, {
      ...loginInput(),
      phone: '+79990000001',
      email: 'new@mail.ru',
    });
    expect(result).toEqual({ ok: true, userId: 'acc-1', accountOutcome: 'linked_existing' });
    expect(world.accounts.get('acc-1')?.email).toBe('old@mail.ru');
    expect(await world.resolvePort.findUserIdsByAnyConfirmedEmail('new@mail.ru')).toEqual(['acc-1']);
  });

  it('case 4: email matches an account with no phone yet, VK phone belongs to nobody -> added as a spare contact', async () => {
    world.seed({ id: 'acc-1', email: 'anna@mail.ru', emailVerified: true });
    const result = await resolveUserIdForVkOAuth(world.oauthBindingsPort, {
      ...loginInput(),
      email: 'anna@mail.ru',
      phone: '+79990000002',
    });
    expect(result).toEqual({ ok: true, userId: 'acc-1', accountOutcome: 'linked_existing' });
    expect(world.accounts.get('acc-1')?.phone).toBe('+79990000002');
  });

  it('case 6: phone confirms one account and email confirms a DIFFERENT account -> refuses login', async () => {
    world.seed({ id: 'acc-1', phone: '+79990000004' });
    world.seed({ id: 'acc-2', email: 'other@mail.ru', emailVerified: true });
    const result = await resolveUserIdForVkOAuth(world.oauthBindingsPort, {
      ...loginInput(),
      phone: '+79990000004',
      email: 'other@mail.ru',
    });
    expect(result).toEqual({ ok: false, reason: 'contact_conflict' });
  });

  it('an email owned by more than one active account is reported ambiguous, not silently picked', async () => {
    world.seed({ id: 'acc-1', email: 'dup@mail.ru', emailVerified: true });
    world.seed({ id: 'acc-2', email: 'dup@mail.ru', emailVerified: true });
    const result = await resolveUserIdForVkOAuth(world.oauthBindingsPort, {
      ...loginInput(),
      email: 'dup@mail.ru',
    });
    expect(result).toEqual({ ok: false, reason: 'email_ambiguous' });
  });

  it('neither phone nor email present -> no_identity, never falls back to creating a bare-vkId account', async () => {
    const result = await resolveUserIdForVkOAuth(world.oauthBindingsPort, loginInput());
    expect(result).toEqual({ ok: false, reason: 'no_identity' });
    expect(world.accounts.size).toBe(0);
  });

  it('a returning VK user (existing binding) logs into the bound account without touching contacts', async () => {
    world.seed({ id: 'acc-1', email: 'anna@mail.ru', emailVerified: true, bindings: [{ provider: 'vk', providerUserId: 'vk-1', email: 'anna@mail.ru' }] });
    const result = await resolveUserIdForVkOAuth(world.oauthBindingsPort, {
      ...loginInput(),
      email: 'anna@mail.ru',
    });
    expect(result).toEqual({ ok: true, userId: 'acc-1', accountOutcome: 'linked_existing' });
    expect(world.accounts.get('acc-1')?.bindings).toHaveLength(1);
  });
});
