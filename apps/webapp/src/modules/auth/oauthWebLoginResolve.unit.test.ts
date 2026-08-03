import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({ env: { DATABASE_URL: 'postgres://test/bersoncarebot_test' } }));

import { bindOAuthUserResolvePort, type OAuthUserResolvePort } from '@/modules/auth/oauthUserResolvePort';
import type { OAuthBindingsPort } from '@/modules/auth/oauthBindingsPort';
import { resolveUserIdForWebOAuthLogin } from '@/modules/auth/oauthWebLoginResolve';

/**
 * IDENTITY_AND_MERGE_SCHEME.md §2a — behavioral fake of the two ports `resolveUserIdForWebOAuthLogin`
 * talks to, modeling exactly the invariants the real Postgres accessors enforce:
 * - `applyVerifiedOAuthEmail` sets the primary ONLY when the account has none (0342/pgOAuthUserResolve.ts).
 * - a confirmed OAuth email lives on the binding row, never overwrites the primary column.
 * - an account has at most one active phone (matches `uq_user_phone_history_user_active`).
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
      if (!acc || acc.email != null) return; // primary set once, never reassigned (F5)
      acc.email = emailRaw.trim();
      acc.emailVerified = true;
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
        email: input.emailRaw, // mirrors the real INSERT: `email` gets $3 regardless of verification
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
    const full: FakeAccount = {
      email: null,
      emailVerified: false,
      phone: null,
      bindings: [],
      ...acc,
    };
    accounts.set(full.id, full);
    return full;
  }

  return { accounts, oauthBindingsPort, resolvePort, seed };
}

function loginInput(overrides: Partial<Parameters<typeof resolveUserIdForWebOAuthLogin>[1]> = {}) {
  return {
    provider: 'google' as const,
    providerUserId: 'sub-1',
    email: null,
    emailVerified: false,
    displayName: 'Anna',
    phone: null,
    ...overrides,
  };
}

describe('resolveUserIdForWebOAuthLogin — IDENTITY_AND_MERGE_SCHEME.md §2a', () => {
  let world: ReturnType<typeof createFakeOAuthWorld>;

  beforeEach(() => {
    world = createFakeOAuthWorld();
    bindOAuthUserResolvePort(world.resolvePort);
  });

  it('case 1: provider email matches an existing account (first time via this provider) -> logs in and confirms the address', async () => {
    world.seed({ id: 'acc-1', email: 'anna@mail.ru', emailVerified: true });
    const result = await resolveUserIdForWebOAuthLogin(world.oauthBindingsPort, {
      ...loginInput(),
      email: 'anna@mail.ru',
      emailVerified: true,
    });
    expect(result).toEqual({ ok: true, userId: 'acc-1', accountOutcome: 'linked_existing' });
    expect(world.accounts.get('acc-1')?.email).toBe('anna@mail.ru');
    expect(world.accounts.get('acc-1')?.bindings).toEqual([
      { provider: 'google', providerUserId: 'sub-1', email: 'anna@mail.ru' },
    ]);
  });

  it('case 2: neither contact is registered anywhere -> creates a new account', async () => {
    const result = await resolveUserIdForWebOAuthLogin(world.oauthBindingsPort, {
      ...loginInput(),
      email: 'brandnew@mail.ru',
      emailVerified: true,
    });
    expect(result.ok).toBe(true);
    expect(world.accounts.size).toBe(1);
  });

  it('case 3/5: phone matches an account that already has a DIFFERENT primary email -> new email stored as a confirmed secondary, primary untouched', async () => {
    world.seed({ id: 'acc-1', phone: '+79990000001', email: 'old@mail.ru', emailVerified: true });
    const result = await resolveUserIdForWebOAuthLogin(world.oauthBindingsPort, {
      ...loginInput(),
      phone: '+79990000001',
      email: 'new@mail.ru',
      emailVerified: true,
    });
    expect(result).toEqual({ ok: true, userId: 'acc-1', accountOutcome: 'linked_existing' });
    const acc = world.accounts.get('acc-1')!;
    expect(acc.email).toBe('old@mail.ru'); // primary unchanged (§3.4 rule 3)
    expect(acc.bindings).toEqual([
      { provider: 'google', providerUserId: 'sub-1', email: 'new@mail.ru' },
    ]);
    // the secondary is now a confirmed contact for equal-rights lookup (§2a item 7)
    expect(await world.resolvePort.findUserIdsByAnyConfirmedEmail('new@mail.ru')).toEqual(['acc-1']);
  });

  it('case 4: email matches an account with no phone yet, provider phone belongs to nobody -> phone added as a spare contact', async () => {
    world.seed({ id: 'acc-1', email: 'anna@mail.ru', emailVerified: true });
    const result = await resolveUserIdForWebOAuthLogin(world.oauthBindingsPort, {
      ...loginInput(),
      email: 'anna@mail.ru',
      emailVerified: true,
      phone: '+79990000002',
    });
    expect(result).toEqual({ ok: true, userId: 'acc-1', accountOutcome: 'linked_existing' });
    expect(world.accounts.get('acc-1')?.phone).toBe('+79990000002');
  });

  it('case 4 (structural limit): email matches an account that already has a DIFFERENT phone -> provider phone is NOT written (no second active phone slot today)', async () => {
    world.seed({ id: 'acc-1', email: 'anna@mail.ru', emailVerified: true, phone: '+79990000003' });
    const result = await resolveUserIdForWebOAuthLogin(world.oauthBindingsPort, {
      ...loginInput(),
      email: 'anna@mail.ru',
      emailVerified: true,
      phone: '+79990000009',
    });
    expect(result.ok).toBe(true);
    expect(world.accounts.get('acc-1')?.phone).toBe('+79990000003');
  });

  it('IDENTITY_AND_MERGE_SCHEME.md §1: an email the provider did NOT verify never resolves to, links, or creates any account — a brand new account is created isolated from the existing owner', async () => {
    world.seed({ id: 'acc-1', email: 'victim@mail.ru', emailVerified: true });
    const result = await resolveUserIdForWebOAuthLogin(world.oauthBindingsPort, {
      ...loginInput(),
      email: 'victim@mail.ru',
      emailVerified: false, // provider did NOT vouch for this address
    });
    expect(result.ok).toBe(true);
    // must NOT log into acc-1 — an unverified email must not authenticate as someone else
    expect(result.ok && result.userId).not.toBe('acc-1');
    // must NOT silently confirm/attach the address to acc-1 either
    expect(world.accounts.get('acc-1')?.bindings).toEqual([]);
  });

  it('case 6: phone confirms one account and email confirms a DIFFERENT account -> refuses login', async () => {
    world.seed({ id: 'acc-1', phone: '+79990000004' });
    world.seed({ id: 'acc-2', email: 'other@mail.ru', emailVerified: true });
    const result = await resolveUserIdForWebOAuthLogin(world.oauthBindingsPort, {
      ...loginInput(),
      phone: '+79990000004',
      email: 'other@mail.ru',
      emailVerified: true,
    });
    expect(result).toEqual({ ok: false, reason: 'contact_conflict' });
  });

  it('IDENTITY_AND_MERGE_SCHEME.md §2a case 1: OAuth login with the SAME address as an already-set but still-unverified primary confirms that email, same as a code would', async () => {
    world.seed({ id: 'acc-1', email: 'unverified@mail.ru', emailVerified: false });
    const result = await resolveUserIdForWebOAuthLogin(world.oauthBindingsPort, {
      ...loginInput(),
      email: 'unverified@mail.ru',
      emailVerified: true,
    });
    expect(result).toEqual({ ok: true, userId: 'acc-1', accountOutcome: 'linked_existing' });
    expect(world.accounts.get('acc-1')?.emailVerified).toBe(true);
  });

  it('F5 invariant: two consecutive OAuth sign-ins with two different provider emails leave the primary unchanged', async () => {
    world.seed({ id: 'acc-1', phone: '+79990000005' });

    const first = await resolveUserIdForWebOAuthLogin(world.oauthBindingsPort, {
      ...loginInput(),
      providerUserId: 'google-sub',
      phone: '+79990000005',
      email: 'first@mail.ru',
      emailVerified: true,
    });
    expect(first.ok).toBe(true);
    expect(world.accounts.get('acc-1')?.email).toBe('first@mail.ru');

    const second = await resolveUserIdForWebOAuthLogin(world.oauthBindingsPort, {
      ...loginInput(),
      provider: 'apple',
      providerUserId: 'apple-sub',
      phone: '+79990000005',
      email: 'second@mail.ru',
      emailVerified: true,
    });
    expect(second.ok).toBe(true);
    expect(world.accounts.get('acc-1')?.email).toBe('first@mail.ru'); // still the first, not overwritten
  });

  it('an email owned by more than one active account is reported ambiguous, not silently picked', async () => {
    world.seed({ id: 'acc-1', email: 'dup@mail.ru', emailVerified: true });
    world.seed({ id: 'acc-2', email: 'dup@mail.ru', emailVerified: true });
    const result = await resolveUserIdForWebOAuthLogin(world.oauthBindingsPort, {
      ...loginInput(),
      email: 'dup@mail.ru',
      emailVerified: true,
    });
    expect(result).toEqual({ ok: false, reason: 'email_ambiguous' });
  });
});
