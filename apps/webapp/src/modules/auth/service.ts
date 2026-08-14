import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { decodeBase64Url } from '@/shared/utils/base64url';
import { env, isProduction } from '@/config/env';
import type { AppSession, SessionUser, UserRole } from '@/shared/types/session';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';
import {
  isVerifiedEmailGlobalAdminAsync,
  reconcileDbRoleWithEnvRole,
  resolveRoleAsync,
  isWhitelistedAsync,
} from './envRole';
import type {
  IdentityResolutionPort,
  MessengerIdentityResolutionHints,
} from './identityResolutionPort';
import type { AccountOutcome } from './oauthYandexResolve';
import { normalizePhone } from './phoneNormalize';
import { isValidPhoneE164 } from './phoneValidation';
import { getRedirectPathForRole } from './redirectPolicy';
import {
  getIntegratorWebappEntrySecret,
  getMaxBotApiKey,
  getTelegramBotToken,
} from '@/modules/system-settings/integrationRuntime';
import {
  parseMaxWebAppInitDataDetailed,
  type MaxInitDataRejectReason,
} from '@/modules/auth/maxWebAppInitValidate';
import { mapMaxStartParamToPatientPath } from '@/modules/auth/messengerStartParamRoutes';
import {
  verifyTelegramLoginWidgetSignature,
  type TelegramLoginWidgetPayload,
} from './telegramLoginVerify';
import { SESSION_COOKIE_NAME } from './sessionCookieNames';
import {
  buildRenewedSessionCookieOptions,
  buildSessionCookieOptions,
  clearFreshLoginMarkerCookie,
  decodeSessionCookie,
  encodeSessionCookie,
  isSessionBeyondAbsoluteMaxAge,
  renewSessionIfActive,
  sessionTtlSecondsForRole,
  shouldRenewSession,
  writeFreshLoginMarkerCookie,
} from './sessionCookie';
// Static import is deliberate — see the comment on finalizeCurrentSession() below. This module
// does NOT import `@/app-layer/di/buildAppDeps` (which would cycle back to this file), so a
// static import here is safe and does not create a require cycle.
import { stampDbPrincipalFromSession } from '@/app-layer/principal/sessionPrincipal';
import {
  enterStaffSecuritySelfPrincipal,
  runWithStaffSecuritySelfPrincipal,
} from '@/app-layer/principal/staffSecuritySelfPrincipal';
import {
  normalizePatientOrganizationPreference,
  PATIENT_ORGANIZATION_PREFERENCE_COOKIE,
} from '@/modules/patient-organization/preference';
import {
  BC_CORRELATION_ID_HEADER,
  ensureCorrelationId,
  ensureDbPrincipalContext,
} from '@bersoncare/db-principal';
import { isDevAuthBypassEnabled } from './devBypassPolicy';
import type { DevBypassStaffWorkspaceKind } from './devBypassClinicAdminWorkspaceReconciliation';
import { requireSessionUserPort } from './sessionUserPort';

const TELEGRAM_INIT_DATA_MAX_AGE_SEC = 3600; // 1 hour

function signIntegratorPayload(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

type IntegratorTokenPayload = {
  sub: string;
  role: UserRole;
  displayName?: string;
  phone?: string;
  /** Optional; see `contracts/webapp-entry-token.json`. */
  integratorUserId?: string;
  bindings?: Record<string, string | undefined>;
  purpose: 'webapp-entry';
  exp: number;
};

export type ExchangeResult = {
  session: AppSession;
  redirectTo: string;
  accountOutcome?: AccountOutcome;
  /**
   * Только для `exchangeIntegratorToken`: ставить `bersoncare_platform=bot` на ответе `/api/auth/exchange`.
   * Для dev bypass (`dev:*`) — всегда false (синтетические bindings не должны включать miniapp-ветку в браузере).
   */
  setMessengerPlatformCookie?: boolean;
};

function buildSession(user: SessionUser): AppSession {
  const now = Math.floor(Date.now() / 1000);
  const ttl = sessionTtlSecondsForRole(user.role);
  return {
    user,
    issuedAt: now,
    expiresAt: now + ttl,
  };
}

async function finalizeCurrentSession(
  session: AppSession,
  patientOrganizationHint?: string | null,
  options: { stampDbPrincipal?: boolean } = {},
): Promise<AppSession> {
  if (options.stampDbPrincipal === false) return session;
  try {
    // Central chokepoint (see also ensureDbPrincipalContext() at the top of getCurrentSession()
    // above, and its doc comment in packages/db-principal). Uses a static import — a dynamic
    // `await import(...)` was here before and is not the fix by itself, but keeping this a
    // direct static call avoids one more layer of indirection around the AsyncLocalStorage
    // continuation. Do not add per-route re-stamps instead — this is the one place all
    // getCurrentSession() callers share.
    await stampDbPrincipalFromSession(session, 'getCurrentSession', patientOrganizationHint);
  } catch {
    /* Session auth behavior stays legacy-compatible; locked DB ports fail closed if no principal was resolved. */
  }
  return session;
}

/**
 * True when this identity has a `platform_users` row behind it, i.e. exactly the condition under
 * which {@link resolveSessionIdentityAgainstDb} performs its DB read and under which a session is
 * required to carry a `sessionEpoch`. Anything else (no DATABASE_URL at all, legacy non-UUID
 * onboarding transports) has no row that could ever hold an epoch.
 */
function sessionIdentityIsDbBacked(user: SessionUser): boolean {
  return Boolean(env.DATABASE_URL?.trim()) && isPlatformUserUuid(user.userId);
}

/**
 * Outcome of re-deriving a cookie's identity from `platform_users`.
 *
 * This is a three-way result rather than `SessionUser | null` so the chokepoint can tell "there is
 * no DB row behind this identity" (nothing to enforce) apart from "there is one and we could not
 * read it" (fail closed). The previous design encoded that distinction as the presence of a field
 * on the returned user, which forced a strip-on-every-fallback dance and made the fail-closed case
 * one forgotten `delete` away from failing open.
 */
type ResolvedSessionIdentity =
  /** The row was read. `sessionEpoch` is its current revocation counter. */
  | { outcome: 'db'; user: SessionUser; sessionEpoch: number }
  /** No `platform_users` row exists behind this identity; the epoch invariant does not apply. */
  | { outcome: 'not-db-backed'; user: SessionUser }
  /** A row should exist but could not be read (lookup failed, row gone, or identity archived). */
  | { outcome: 'unreadable' };

/**
 * Подтягивает актуальные ФИО/телефон/bindings из БД и отсекает сессии после удаления строки в
 * `platform_users` (например ops `reset-user`), когда cookie ещё валиден по подписи.
 */
async function resolveSessionIdentityAgainstDb(
  user: SessionUser,
): Promise<ResolvedSessionIdentity> {
  if (!sessionIdentityIsDbBacked(user)) return { outcome: 'not-db-backed', user };
  try {
    // `getCurrentSession()` can run more than once during one RSC render. Its outer principal
    // cell is deliberately mutable so the completed session can promote the request to staff,
    // but an in-flight identity lookup must not share that cell with a sibling resolver. Scope
    // the exact-id read to its own identity-self cell so a concurrent staff promotion cannot
    // change the principal observed by `pgUserByPhone.findByUserId()` mid-query.
    const fresh = await runWithStaffSecuritySelfPrincipal(
      user.userId,
      'getCurrentSession:identity-self',
      async () => {
        return requireSessionUserPort().findByUserId(user.userId);
      },
    );
    // `null` here covers a deleted row AND an archived one (D2 — see findByUserId).
    if (!fresh || typeof fresh.sessionEpoch !== 'number') return { outcome: 'unreadable' };
    return { outcome: 'db', user: fresh, sessionEpoch: fresh.sessionEpoch };
  } catch {
    // Fail closed for everyone, staff and patients alike. The old code fell back to the COOKIE's
    // user for patients on a lookup failure; that fallback is gone. An identity whose revocation
    // state cannot be read is not an accepted session — a DB outage must not become an authorization
    // decision, and "the row says nothing" is not the same as "the row says yes".
    return { outcome: 'unreadable' };
  }
}

/**
 * Attaches the CURRENT `platform_users.session_epoch` to a session about to be written to a cookie.
 *
 * This is the mint-side half of the revocation invariant, and it lives in one place for the same
 * reason the comparison does: every login path in this file funnels through
 * {@link persistNewAuthSession}. Most callers already hold a user loaded by `findByUserId`, which
 * carries the epoch, and short-circuit here without a query; the token/messenger paths that build a
 * user from a payload do not, and they are exactly the paths that would otherwise mint a cookie the
 * very next request rejects.
 *
 * It THROWS rather than minting an epoch-less cookie when the read fails. A login that fails loudly
 * is diagnosable; a login that succeeds and then 401s on every subsequent request is the D1 symptom
 * this whole change exists to remove.
 */
async function withFreshSessionEpoch(session: AppSession): Promise<AppSession> {
  if (typeof session.user.sessionEpoch === 'number') return session;
  if (!sessionIdentityIsDbBacked(session.user)) return session;
  const fresh = await runWithStaffSecuritySelfPrincipal(
    session.user.userId,
    'auth/persistNewAuthSession:identity-self',
    async () => {
      return requireSessionUserPort().findByUserId(session.user.userId);
    },
  );
  if (!fresh || typeof fresh.sessionEpoch !== 'number') {
    throw new Error('session_epoch_unavailable_at_mint');
  }
  return { ...session, user: { ...session.user, sessionEpoch: fresh.sessionEpoch } };
}

async function persistNewAuthSession(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  session: AppSession,
): Promise<AppSession> {
  const stamped = await withFreshSessionEpoch(session);
  cookieStore.set(
    SESSION_COOKIE_NAME,
    encodeSessionCookie(stamped),
    buildSessionCookieOptions(stamped),
  );
  writeFreshLoginMarkerCookie(cookieStore);
  return stamped;
}

async function parseIntegratorToken(token: string): Promise<IntegratorTokenPayload | null> {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const entrySecret = (await getIntegratorWebappEntrySecret()).trim();
  if (!entrySecret || !safeEqualStrings(signature, signIntegratorPayload(payload, entrySecret)))
    return null;

  let parsed: IntegratorTokenPayload;
  try {
    parsed = JSON.parse(decodeBase64Url(payload)) as IntegratorTokenPayload;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (parsed.purpose !== 'webapp-entry' || parsed.exp <= now) {
    if (process.env.NODE_ENV !== 'test') {
      console.info(
        '[auth/parseToken] rejected purpose=%s expired=%s delta=%ds sub=%s',
        parsed.purpose,
        parsed.exp <= now,
        parsed.exp - now,
        parsed.sub,
      );
    }
    return null;
  }
  return parsed;
}

function parseDevBypassToken(token: string): IntegratorTokenPayload | null {
  const enabled = isDevAuthBypassEnabled({
    nodeEnv: env.NODE_ENV,
    allowDevAuthBypass: env.ALLOW_DEV_AUTH_BYPASS,
  });
  if (!enabled) return null;

  const presets: Record<string, IntegratorTokenPayload> = {
    'dev:client': {
      sub: '00000000-0000-0000-0000-000000000001',
      role: 'client',
      displayName: 'Demo Client',
      phone: '+79990000001',
      bindings: { telegramId: '111111111' },
      purpose: 'webapp-entry',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    'dev:doctor': {
      sub: '00000000-0000-0000-0000-000000000002',
      role: 'doctor',
      displayName: 'Demo Doctor',
      phone: '+79990000002',
      bindings: { telegramId: '222222222' },
      purpose: 'webapp-entry',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    'dev:admin': {
      sub: '00000000-0000-0000-0000-000000000003',
      role: 'admin',
      displayName: 'Demo Admin',
      phone: '+79990000003',
      bindings: { telegramId: '333333333' },
      purpose: 'webapp-entry',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    'dev:clinic-admin': {
      sub: '00000000-0000-0000-0000-000000000004',
      role: 'doctor',
      displayName: 'Demo Clinic Owner',
      phone: '+79990000004',
      bindings: { telegramId: '999999999999004' },
      purpose: 'webapp-entry',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    'dev:doctor-isolated': {
      sub: 'd0000000-0000-4000-8000-000000000005',
      role: 'doctor',
      displayName: 'Demo Isolated Doctor',
      phone: '+79990000005',
      bindings: { telegramId: '999999999999005' },
      purpose: 'webapp-entry',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    'dev:client-isolated': {
      sub: 'd0000000-0000-4000-8000-000000000006',
      role: 'client',
      displayName: 'Demo Isolated Patient',
      phone: '+79990000006',
      bindings: { telegramId: '999999999999006' },
      purpose: 'webapp-entry',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    'dev:doctor-colleague': {
      sub: 'd0000000-0000-4000-8000-000000000007',
      role: 'doctor',
      displayName: 'Demo Colleague Doctor',
      phone: '+79990000007',
      bindings: { telegramId: '999999999999007' },
      purpose: 'webapp-entry',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    'dev:client-colleague': {
      sub: 'd0000000-0000-4000-8000-000000000008',
      role: 'client',
      displayName: 'Demo Colleague Patient',
      phone: '+79990000008',
      bindings: { telegramId: '999999999999008' },
      purpose: 'webapp-entry',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
  };

  return presets[token] ?? null;
}

export async function classifyVerifiedIntegratorTokenChannel(
  token: string,
): Promise<'dev_bypass' | 'telegram' | 'max' | null> {
  if (parseDevBypassToken(token)) return 'dev_bypass';
  const parsed = await parseIntegratorToken(token);
  if (!parsed) return null;
  const binding = effectiveMessengerBinding(parsed);
  return binding?.channelCode === 'telegram' || binding?.channelCode === 'max'
    ? binding.channelCode
    : null;
}

async function isAllowedByWhitelist(
  parsed: IntegratorTokenPayload,
  identityResolutionPort?: IdentityResolutionPort | null,
): Promise<boolean> {
  if (parsed.role === 'admin') return true;
  const eff = effectiveMessengerBinding(parsed);
  const tokenIds = {
    telegramId: eff?.channelCode === 'telegram' ? eff.externalId : parsed.bindings?.telegramId,
    maxId: eff?.channelCode === 'max' ? eff.externalId : parsed.bindings?.maxId,
    phone: parsed.phone?.trim(),
  };
  if (await isWhitelistedAsync(tokenIds)) return true;

  // For messenger entry tokens (especially MAX), token may not contain phone.
  // If binding already exists, re-check whitelist against canonical user ids + phone.
  if (!identityResolutionPort) return false;
  const binding = eff;
  if (!binding) return false;
  const existing = await identityResolutionPort.findByChannelBinding({
    channelCode: binding.channelCode,
    externalId: binding.externalId,
  });
  if (!existing) return false;
  return isWhitelistedAsync({
    telegramId: existing.bindings?.telegramId ?? tokenIds.telegramId,
    maxId: existing.bindings?.maxId ?? tokenIds.maxId,
    phone: existing.phone?.trim() || tokenIds.phone,
  });
}

/**
 * Legacy / compact entry tokens may encode messenger id only in `sub` (`tg:…`, `max:…`) without `bindings`.
 */
function bindingFromExternalSub(
  sub: string,
): { channelCode: 'telegram' | 'max'; externalId: string } | null {
  const s = sub.trim();
  const tg = /^tg:(\d+)$/.exec(s);
  if (tg) return { channelCode: 'telegram', externalId: tg[1]! };
  const max = /^max:(.+)$/.exec(s);
  if (max) {
    const id = max[1]!.trim();
    if (id.length > 0) return { channelCode: 'max', externalId: id };
  }
  return null;
}

function effectiveMessengerBinding(
  parsed: IntegratorTokenPayload,
): { channelCode: 'telegram' | 'max' | 'vk'; externalId: string } | null {
  return firstBinding(parsed) ?? bindingFromExternalSub(parsed.sub);
}

/** Optional signed webapp-entry token must denote the same messenger identity as the verified channel (no raw client UUID trust). */
function webappEntryTokenMatchesVerifiedMessenger(
  tokenPayload: IntegratorTokenPayload,
  channelCode: 'telegram' | 'max' | 'vk',
  externalId: string,
): boolean {
  const eff = effectiveMessengerBinding(tokenPayload);
  if (!eff) return false;
  return eff.channelCode === channelCode && eff.externalId === externalId;
}

/** Validates Telegram Web App initData (from window.Telegram.WebApp.initData). Returns user id and role or null. */
async function validateTelegramInitData(
  initData: string,
): Promise<{
  telegramId: string;
  role: UserRole;
  displayName?: string;
  startParam?: string;
} | null> {
  const botToken = (await getTelegramBotToken()).trim();
  if (!botToken?.trim()) return null;

  const params = new URLSearchParams(initData.trim());
  const hash = params.get('hash');
  if (!hash) return null;

  const authDate = params.get('auth_date');
  if (!authDate) return null;
  const authTs = Number(authDate);
  if (!Number.isFinite(authTs)) return null;
  if (Math.floor(Date.now() / 1000) - authTs > TELEGRAM_INIT_DATA_MAX_AGE_SEC) return null;

  const dataCheckParts: string[] = [];
  for (const key of [...params.keys()].sort()) {
    if (key === 'hash') continue;
    dataCheckParts.push(`${key}=${params.get(key)!}`);
  }
  const dataCheckString = dataCheckParts.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!safeEqualStrings(computedHash, hash.toLowerCase())) return null;

  const userJson = params.get('user');
  if (!userJson) return null;
  let user: { id?: number; first_name?: string; last_name?: string };
  try {
    user = JSON.parse(userJson) as { id?: number; first_name?: string; last_name?: string };
  } catch {
    return null;
  }
  const telegramId = user.id != null ? String(user.id) : '';
  if (!telegramId) return null;

  if (!(await isWhitelistedAsync({ telegramId }))) return null;

  const role: UserRole = await resolveRoleAsync({ telegramId });
  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || undefined;

  const startParamRaw = params.get('start_param');
  const startParam =
    startParamRaw != null && startParamRaw.trim() !== '' ? startParamRaw.trim() : undefined;

  return { telegramId, role, displayName, ...(startParam ? { startParam } : {}) };
}

function tokenToUser(token: IntegratorTokenPayload): SessionUser {
  return {
    userId: token.sub,
    role: token.role,
    displayName: token.displayName ?? token.sub,
    phone: token.phone,
    bindings: {
      telegramId: token.bindings?.telegramId,
      vkId: token.bindings?.vkId,
      maxId: token.bindings?.maxId,
    },
  };
}

function firstBinding(
  parsed: IntegratorTokenPayload,
): { channelCode: 'telegram' | 'max' | 'vk'; externalId: string } | null {
  if (parsed.bindings?.telegramId)
    return { channelCode: 'telegram', externalId: parsed.bindings.telegramId };
  if (parsed.bindings?.maxId) return { channelCode: 'max', externalId: parsed.bindings.maxId };
  if (parsed.bindings?.vkId) return { channelCode: 'vk', externalId: parsed.bindings.vkId };
  return null;
}

/** Signed webapp-entry token → hints for `findOrCreateByChannelBinding` (Phase B: canon before INSERT). */
function messengerResolutionHintsFromToken(
  parsed: IntegratorTokenPayload,
): MessengerIdentityResolutionHints | undefined {
  const hints: MessengerIdentityResolutionHints = {};
  const sub = parsed.sub.trim();
  if (isPlatformUserUuid(sub)) {
    hints.platformUserSub = sub;
  }
  const intRaw = parsed.integratorUserId;
  if (typeof intRaw === 'string' && intRaw.trim() !== '') {
    hints.integratorUserId = intRaw.trim();
  }
  const phoneRaw = parsed.phone;
  if (typeof phoneRaw === 'string' && phoneRaw.trim() !== '') {
    const n = normalizePhone(phoneRaw.trim());
    if (isValidPhoneE164(n)) {
      hints.phoneNormalized = n;
    }
  }
  if (
    hints.platformUserSub == null &&
    hints.integratorUserId == null &&
    hints.phoneNormalized == null
  ) {
    return undefined;
  }
  return hints;
}

async function optionalResolutionHintsFromVerifiedWebappEntryToken(
  embeddedToken: string | null | undefined,
  verifiedBinding: { channelCode: 'telegram' | 'max' | 'vk'; externalId: string },
): Promise<MessengerIdentityResolutionHints | undefined> {
  const raw = embeddedToken?.trim();
  if (!raw) return undefined;
  const parsed = await parseIntegratorToken(raw);
  if (!parsed) return undefined;
  if (
    !webappEntryTokenMatchesVerifiedMessenger(
      parsed,
      verifiedBinding.channelCode,
      verifiedBinding.externalId,
    )
  ) {
    return undefined;
  }
  return messengerResolutionHintsFromToken(parsed);
}

/** Dev bypass + БД: синтетический аккаунт уже найден read-only по binding; синхронизируем его preset phone. */
async function applyDevBypassPlatformUserPhoneInDb(
  user: SessionUser,
  parsed: IntegratorTokenPayload,
): Promise<SessionUser> {
  const raw = parsed.phone?.trim();
  if (!raw) return user;
  const phone = normalizePhone(raw);
  if (!isValidPhoneE164(phone)) return user;
  if (!isPlatformUserUuid(user.userId)) return user;

  enterStaffSecuritySelfPrincipal(user.userId, 'auth/exchange:dev-bypass-verified-self');

  const { applyDevBypassPlatformUserPhoneInDb } =
    await import('@/modules/auth/devBypassPlatformUserPhonePort');
  await applyDevBypassPlatformUserPhoneInDb(user.userId, user.role, phone);

  const fresh = await requireSessionUserPort().findByUserId(user.userId);
  // Keep explicit dev bypass role from token preset even if DB row still has stale role.
  return fresh ? { ...fresh, role: user.role } : { ...user, phone };
}

function devBypassPresetPhoneMatches(user: SessionUser, parsed: IntegratorTokenPayload): boolean {
  const rawPresetPhone = parsed.phone?.trim();
  const rawStoredPhone = user.phone?.trim();
  if (!rawPresetPhone || !rawStoredPhone) return false;

  const presetPhone = normalizePhone(rawPresetPhone);
  const storedPhone = normalizePhone(rawStoredPhone);
  return (
    isValidPhoneE164(presetPhone) && isValidPhoneE164(storedPhone) && presetPhone === storedPhone
  );
}

export async function exchangeIntegratorToken(
  token: string,
  identityResolutionPort?: IdentityResolutionPort | null,
  updateRoleFn?: ((platformUserId: string, role: string) => Promise<void>) | null,
): Promise<ExchangeResult | null> {
  const devParsed = parseDevBypassToken(token);
  const lockedDevBypass = Boolean(devParsed) && env.DB_PRINCIPAL_CONTEXT_MODE === 'locked';
  const parsed = devParsed ?? (await parseIntegratorToken(token));
  if (!parsed) {
    if (process.env.NODE_ENV !== 'test') {
      console.info('[auth/exchange] token_parse_failed tokenLen=%d', token.length);
    }
    return null;
  }

  if (!devParsed && !(await isAllowedByWhitelist(parsed, identityResolutionPort))) {
    if (process.env.NODE_ENV !== 'test') {
      console.info(
        '[auth/exchange] whitelist_rejected sub=%s telegramId=%s',
        parsed.sub,
        parsed.bindings?.telegramId,
      );
    }
    return null;
  }

  let user: SessionUser;
  let accountOutcome: AccountOutcome | undefined;
  if (identityResolutionPort) {
    const binding = effectiveMessengerBinding(parsed);
    if (binding) {
      if (devParsed) {
        const existing = await identityResolutionPort.findByChannelBinding(binding);
        if (!existing) return null;
        user = existing;
      } else {
        const resolutionHints = messengerResolutionHintsFromToken(parsed);
        const resolved = await identityResolutionPort.findOrCreateByChannelBinding({
          channelCode: binding.channelCode,
          externalId: binding.externalId,
          displayName: parsed.displayName,
          role: parsed.role,
          ...(resolutionHints ? { resolutionHints } : {}),
        });
        user = resolved.user;
        accountOutcome = resolved.accountOutcome;
      }
    } else if (!devParsed) {
      const subTrim = parsed.sub.trim();
      // Phase C: bare platform UUID in `sub` (no messenger binding in token) → load canon from DB.
      if (env.DATABASE_URL?.trim() && isPlatformUserUuid(subTrim)) {
        enterStaffSecuritySelfPrincipal(subTrim, 'auth/exchange:signed-platform-self');
        const fromDb = await requireSessionUserPort().findByUserId(subTrim);
        if (!fromDb) {
          if (process.env.NODE_ENV !== 'test') {
            console.info('[auth/exchange] uuid_sub_no_platform_row');
          }
          return null;
        }
        user = fromDb;
      } else {
        user = tokenToUser(parsed);
      }
    } else {
      user = tokenToUser(parsed);
    }
  } else {
    user = tokenToUser(parsed);
  }

  if (devParsed && user.role !== parsed.role) {
    // Dev bypass tokens must keep explicit preset role (dev:admin/dev:doctor/dev:client),
    // even when identity resolution returns an existing row with stale role from DB.
    if (!lockedDevBypass && updateRoleFn && isPlatformUserUuid(user.userId)) {
      await updateRoleFn(user.userId, parsed.role);
    }
    user = { ...user, role: parsed.role };
  }

  if (devParsed && env.DATABASE_URL?.trim()) {
    if (lockedDevBypass) {
      if (!devBypassPresetPhoneMatches(user, parsed)) return null;
    } else {
      user = await applyDevBypassPlatformUserPhoneInDb(user, parsed);
      const staffWorkspaceKind: DevBypassStaffWorkspaceKind | null =
        parsed.sub === '00000000-0000-0000-0000-000000000002'
          ? 'doctor'
          : parsed.sub === '00000000-0000-0000-0000-000000000003'
            ? 'global_admin'
            : parsed.sub === '00000000-0000-0000-0000-000000000004'
              ? 'clinic_admin'
              : null;
      if (staffWorkspaceKind) {
        const { ensureDevBypassStaffWorkspace } =
          await import('@/modules/auth/devBypassClinicAdminWorkspacePort');
        await ensureDevBypassStaffWorkspace({
          platformUserId: user.userId,
          displayName: parsed.displayName ?? user.displayName,
          kind: staffWorkspaceKind,
        });
      }
    }
  }

  if (
    !devParsed &&
    Boolean(env.DATABASE_URL?.trim()) &&
    identityResolutionPort &&
    user.role === 'client' &&
    !isPlatformUserUuid(user.userId) &&
    process.env.NODE_ENV !== 'test'
  ) {
    console.info('[auth/exchange] client_session_transport=legacy_non_uuid_onboarding_only');
  }

  if (!devParsed) {
    // C-4: the messenger/phone allowlists never promote anyone anymore (envRole.ts), so this only
    // ever composes back to `user.role` unchanged — see reconcileDbRoleWithEnvRole's doc comment.
    // Kept (rather than deleted) so a role source that resolves something other than "client" here
    // again in the future still cannot demote an existing DB-persisted staff role.
    const envRole = await resolveRoleAsync({
      phone: user.phone ?? parsed.phone,
      telegramId: user.bindings?.telegramId ?? parsed.bindings?.telegramId,
      maxId: user.bindings?.maxId ?? parsed.bindings?.maxId,
    });
    const reconciledRole = reconcileDbRoleWithEnvRole(user.role, envRole);
    if (user.role !== reconciledRole) {
      if (updateRoleFn) await updateRoleFn(user.userId, reconciledRole);
      user = { ...user, role: reconciledRole };
    }
  }

  const built: AppSession = devParsed
    ? {
        ...buildSession(user),
        authSource: 'dev_bypass',
        // The production platform-admin gate remains factor-only. This explicitly enabled
        // non-production bypass represents the completed factor so DEV can exercise the
        // dedicated global-admin DB pool instead of redirecting before any platform query.
        ...(user.role === 'admin'
          ? {
              staffSecurity: {
                assurance: 'factor_verified' as const,
                verifiedAt: Math.floor(Date.now() / 1000),
              },
            }
          : {}),
      }
    : buildSession(user);
  const cookieStore = await cookies();
  // The session that is RETURNED is the one that was actually written to the cookie, epoch and all
  // (C-1) — never the pre-stamp draft, so a caller can never hand back a session shape the next
  // request would reject.
  const session = await persistNewAuthSession(cookieStore, built);

  const setMessengerPlatformCookie =
    !devParsed && (Boolean(user.bindings?.maxId) || Boolean(user.bindings?.telegramId));

  return {
    session,
    redirectTo: getRedirectPathForRole(user.role),
    setMessengerPlatformCookie,
    ...(accountOutcome ? { accountOutcome } : {}),
  };
}
export async function exchangeTelegramInitData(
  initData: string,
  identityResolutionPort?: IdentityResolutionPort | null,
  updateRoleFn?: ((platformUserId: string, role: string) => Promise<void>) | null,
): Promise<ExchangeResult | null> {
  const parsed = await validateTelegramInitData(initData);
  if (!parsed) return null;

  const verifiedBinding = { channelCode: 'telegram' as const, externalId: parsed.telegramId };
  const resolutionHints = await optionalResolutionHintsFromVerifiedWebappEntryToken(
    parsed.startParam,
    verifiedBinding,
  );
  if (resolutionHints && process.env.NODE_ENV !== 'test' && process.env.DEBUG_AUTH === '1') {
    const kinds = [
      resolutionHints.platformUserSub && 'sub',
      resolutionHints.integratorUserId && 'integrator',
      resolutionHints.phoneNormalized && 'phone',
    ]
      .filter(Boolean)
      .join(',');
    console.info('[auth/telegram-init] resolution_hints_from=start_param kinds=%s', kinds);
  }

  let user: SessionUser;
  let accountOutcome: AccountOutcome | undefined;
  if (identityResolutionPort) {
    const resolved = await identityResolutionPort.findOrCreateByChannelBinding({
      channelCode: 'telegram',
      externalId: parsed.telegramId,
      displayName: parsed.displayName,
      role: parsed.role,
      ...(resolutionHints ? { resolutionHints } : {}),
    });
    user = resolved.user;
    accountOutcome = resolved.accountOutcome;
  } else {
    // No DB port (tests): `tg:…` transport — onboarding-only for client tier; see `sessionCanonicalUserIdPolicy.ts`.
    user = {
      userId: `tg:${parsed.telegramId}`,
      role: parsed.role,
      displayName: parsed.displayName ?? parsed.telegramId,
      bindings: { telegramId: parsed.telegramId },
    };
  }

  // C-4: see the comment on the equivalent block in exchangeIntegratorToken above.
  const envRole = await resolveRoleAsync({
    phone: user.phone,
    telegramId: parsed.telegramId,
    maxId: user.bindings?.maxId,
  });
  const reconciledRole = reconcileDbRoleWithEnvRole(user.role, envRole);
  if (user.role !== reconciledRole) {
    if (updateRoleFn) await updateRoleFn(user.userId, reconciledRole);
    user = { ...user, role: reconciledRole };
  }

  const cookieStore = await cookies();
  const session = await persistNewAuthSession(cookieStore, buildSession(user));

  let redirectTo = getRedirectPathForRole(user.role);
  if (user.role === 'client' && parsed.startParam) {
    const fromParam = mapMaxStartParamToPatientPath(parsed.startParam);
    if (fromParam) redirectTo = fromParam;
  }

  return {
    session,
    redirectTo,
    ...(accountOutcome ? { accountOutcome } : {}),
  };
}

/** Причина отказа MAX initData: валидация строки или отсутствие ключа в admin settings. */
export type MaxInitDenyReason = MaxInitDataRejectReason | 'max_bot_api_key_missing';

export type MaxInitExchangeDenied = { denied: true; reason: MaxInitDenyReason };

type ValidateMaxOk = {
  maxUserId: string;
  role: UserRole;
  displayName?: string;
  startParam?: string;
};

async function validateMaxInitData(
  initData: string,
): Promise<{ ok: true; data: ValidateMaxOk } | { ok: false; reason: MaxInitDenyReason }> {
  const botToken = (await getMaxBotApiKey()).trim();
  if (!botToken) return { ok: false, reason: 'max_bot_api_key_missing' };
  const parseRes = parseMaxWebAppInitDataDetailed(initData, botToken);
  if (!parseRes.ok) return { ok: false, reason: parseRes.reason };
  const role: UserRole = await resolveRoleAsync({ maxId: parseRes.data.maxUserId });
  return {
    ok: true,
    data: {
      maxUserId: parseRes.data.maxUserId,
      role,
      ...(parseRes.data.displayName ? { displayName: parseRes.data.displayName } : {}),
      ...(parseRes.data.startParam ? { startParam: parseRes.data.startParam } : {}),
    },
  };
}

/** Валидация `window.WebApp.initData` (MAX Mini App) и создание сессии, аналог `exchangeTelegramInitData`. */
export async function exchangeMaxInitData(
  initData: string,
  identityResolutionPort?: IdentityResolutionPort | null,
  updateRoleFn?: ((platformUserId: string, role: string) => Promise<void>) | null,
): Promise<ExchangeResult | MaxInitExchangeDenied> {
  const validated = await validateMaxInitData(initData);
  if (!validated.ok) return { denied: true, reason: validated.reason };
  const parsed = validated.data;

  const verifiedBinding = { channelCode: 'max' as const, externalId: parsed.maxUserId };
  const resolutionHints = await optionalResolutionHintsFromVerifiedWebappEntryToken(
    parsed.startParam,
    verifiedBinding,
  );
  if (resolutionHints && process.env.NODE_ENV !== 'test' && process.env.DEBUG_AUTH === '1') {
    const kinds = [
      resolutionHints.platformUserSub && 'sub',
      resolutionHints.integratorUserId && 'integrator',
      resolutionHints.phoneNormalized && 'phone',
    ]
      .filter(Boolean)
      .join(',');
    console.info('[auth/max-init] resolution_hints_from=start_param kinds=%s', kinds);
  }

  let user: SessionUser;
  let accountOutcome: AccountOutcome | undefined;
  if (identityResolutionPort) {
    const resolved = await identityResolutionPort.findOrCreateByChannelBinding({
      channelCode: 'max',
      externalId: parsed.maxUserId,
      displayName: parsed.displayName,
      role: parsed.role,
      ...(resolutionHints ? { resolutionHints } : {}),
    });
    user = resolved.user;
    accountOutcome = resolved.accountOutcome;
  } else {
    user = {
      userId: `max:${parsed.maxUserId}`,
      role: parsed.role,
      displayName: parsed.displayName ?? parsed.maxUserId,
      bindings: { maxId: parsed.maxUserId },
    };
  }

  // C-4: see the comment on the equivalent block in exchangeIntegratorToken above.
  const envRole = await resolveRoleAsync({
    phone: user.phone,
    telegramId: user.bindings?.telegramId,
    maxId: parsed.maxUserId,
  });
  const reconciledRole = reconcileDbRoleWithEnvRole(user.role, envRole);
  if (user.role !== reconciledRole) {
    if (updateRoleFn) await updateRoleFn(user.userId, reconciledRole);
    user = { ...user, role: reconciledRole };
  }

  const cookieStore = await cookies();
  const session = await persistNewAuthSession(cookieStore, buildSession(user));

  let redirectTo = getRedirectPathForRole(user.role);
  if (user.role === 'client' && parsed.startParam) {
    const fromParam = mapMaxStartParamToPatientPath(parsed.startParam);
    if (fromParam) redirectTo = fromParam;
  }

  return {
    session,
    redirectTo,
    ...(accountOutcome ? { accountOutcome } : {}),
  };
}

/**
 * Вход через Telegram Login Widget (веб, не Mini App initData).
 * Подпись: HMAC-SHA256(SHA256(bot_token), data_check_string). Merge по телефону из виджета недоступен (поле не приходит).
 */
export async function exchangeTelegramLoginWidget(
  raw: TelegramLoginWidgetPayload,
  identityResolutionPort?: IdentityResolutionPort | null,
  updateRoleFn?: ((platformUserId: string, role: string) => Promise<void>) | null,
  webappEntryToken?: string | null,
): Promise<ExchangeResult | null> {
  const botToken = (await getTelegramBotToken()).trim();
  if (!botToken) return null;

  const verified = verifyTelegramLoginWidgetSignature(raw, botToken);
  if (!verified.ok) return null;

  const telegramId = verified.telegramId;

  if (!(await isWhitelistedAsync({ telegramId }))) return null;

  const fn = typeof raw.first_name === 'string' ? raw.first_name.trim() : '';
  const ln = typeof raw.last_name === 'string' ? raw.last_name.trim() : '';
  const displayName = [fn, ln].filter(Boolean).join(' ').trim();

  const role = await resolveRoleAsync({ telegramId });

  const verifiedBinding = { channelCode: 'telegram' as const, externalId: telegramId };
  const resolutionHints = await optionalResolutionHintsFromVerifiedWebappEntryToken(
    webappEntryToken,
    verifiedBinding,
  );
  if (resolutionHints && process.env.NODE_ENV !== 'test' && process.env.DEBUG_AUTH === '1') {
    const kinds = [
      resolutionHints.platformUserSub && 'sub',
      resolutionHints.integratorUserId && 'integrator',
      resolutionHints.phoneNormalized && 'phone',
    ]
      .filter(Boolean)
      .join(',');
    console.info('[auth/telegram-login] resolution_hints_from=webapp_entry_token kinds=%s', kinds);
  }

  let user: SessionUser;
  let accountOutcome: AccountOutcome | undefined;
  if (identityResolutionPort) {
    const resolved = await identityResolutionPort.findOrCreateByChannelBinding({
      channelCode: 'telegram',
      externalId: telegramId,
      displayName: displayName || undefined,
      role,
      ...(resolutionHints ? { resolutionHints } : {}),
    });
    user = resolved.user;
    accountOutcome = resolved.accountOutcome;
  } else {
    // No DB port (tests): `tg:…` — onboarding-only for client; see `sessionCanonicalUserIdPolicy.ts`.
    user = {
      userId: `tg:${telegramId}`,
      role,
      displayName: displayName || telegramId,
      bindings: { telegramId },
    };
  }

  // C-4: see the comment on the equivalent block in exchangeIntegratorToken above.
  const envRole = await resolveRoleAsync({
    phone: user.phone,
    telegramId,
    maxId: user.bindings?.maxId,
  });
  const reconciledRole = reconcileDbRoleWithEnvRole(user.role, envRole);
  if (user.role !== reconciledRole) {
    if (updateRoleFn) await updateRoleFn(user.userId, reconciledRole);
    user = { ...user, role: reconciledRole };
  }

  const cookieStore = await cookies();
  const session = await persistNewAuthSession(cookieStore, buildSession(user));

  return {
    session,
    redirectTo: getRedirectPathForRole(user.role),
    ...(accountOutcome ? { accountOutcome } : {}),
  };
}

/**
 * Роль сверяется с env: телефон (ADMIN_PHONES / DOCTOR_PHONES), Telegram / Max ID
 * (ADMIN_TELEGRAM_ID, DOCTOR_TELEGRAM_IDS, ADMIN_MAX_IDS, DOCTOR_MAX_IDS).
 * Cookie и при наличии БД строка role в platform_users обновляются при расхождении.
 *
 * При наличии `DATABASE_URL` и UUID `userId` сессия сверяется с `platform_users`: удалённый пользователь
 * даёт `null` (клиент увидит «не авторизован»), даже если cookie ещё не истёк.
 */
async function getCurrentSessionWithPrincipalMode(
  options: { stampDbPrincipal?: boolean } = {},
): Promise<AppSession | null> {
  // MUST run before the first `await cookies()` below — this is the other half of the central
  // DB-principal fix (see the doc comment on ensureDbPrincipalContext() in
  // packages/db-principal/src/index.ts). Diagnostic proof (TEST, live logging of
  // getCurrentDbPrincipal() at each hop, this session): a principal cell created via enterWith()
  // *after* crossing a Next.js dynamic-API boundary (cookies()) does not survive back out to the
  // original caller once getCurrentSession()'s promise resolves. requireRole.ts guards that call
  // ensureDbPrincipalContext() before invoking getCurrentSession() were unaffected because their
  // cell already existed *before* the cookies() boundary — every enterWith() downstream (here, in
  // stampDbPrincipalFromSession, in the guards' own re-stamp) now mutates that SAME pre-existing
  // cell in place (ensureDbPrincipalContext no longer replaces an existing cell), so it survives
  // the unwind regardless of how many boundaries sit in between. Establishing the cell here, as
  // the very first statement, makes every getCurrentSession() caller behave the same way whether
  // or not it goes through a guard.
  ensureDbPrincipalContext({ source: 'getCurrentSession:pending' });
  try {
    const requestHeaders = await headers();
    ensureCorrelationId(requestHeaders.get(BC_CORRELATION_ID_HEADER));
  } catch {
    // Unit surfaces may mock only cookies(); runtime still gets a fresh bounded id.
    ensureCorrelationId();
  }
  const cookieStore = await cookies();
  const patientOrganizationHint = normalizePatientOrganizationPreference(
    cookieStore.get(PATIENT_ORGANIZATION_PREFERENCE_COOKIE)?.value,
  );
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const decoded = raw ? decodeSessionCookie(raw) : null;
  if (!decoded?.user) {
    if (raw && process.env.NODE_ENV !== 'production') {
      console.info('[auth] session_cookie_invalid_or_expired');
    }
    return null;
  }

  // ===================================================================================
  // THE session-revocation chokepoint (C-1, 2026-07-26). One mechanism, one comparison,
  // no clocks. No handler anywhere repeats any of this.
  // ===================================================================================
  const resolved = await resolveSessionIdentityAgainstDb(decoded.user);
  // The row should exist but could not be read — deleted, archived (D2), or the lookup failed.
  // An unreadable revocation state is never an accepted session.
  if (resolved.outcome === 'unreadable') return null;
  if (resolved.outcome === 'db') {
    // `platform_users.session_epoch` vs the epoch the cookie was minted with, compared for EQUALITY.
    // Both sides are the same integer written by the same authority, so there is no clock, no skew
    // allowance and no direction to get wrong: any revocation event increments the column, and every
    // cookie carrying the old value dies at once. A cookie that carries NO epoch (`undefined`)
    // cannot equal a live row either — the column is `NOT NULL DEFAULT 1 CHECK (>= 1)` — which is
    // what makes the cutover sign every pre-existing session out exactly once.
    if (decoded.user.sessionEpoch !== resolved.sessionEpoch) return null;
  }
  const resolvedUser = resolved.user;
  // Absolute age cap, enforced here so the proxy's renewal path cannot bypass it (renewal itself
  // also refuses past this point — see sessionCookie.ts — but a cookie renewed right up to the
  // boundary and then merely replayed without ever asking to renew again must still die here).
  if (
    isSessionBeyondAbsoluteMaxAge({
      issuedAt: decoded.issuedAt,
      user: resolvedUser,
      operatorSession: decoded.operatorSession,
    })
  ) {
    return null;
  }

  // Normalize doctor session shape without writing cookie here — cookies().set()
  // is only allowed in Server Actions / Route Handlers, not in Server Component render.
  let session: AppSession = { ...decoded, user: resolvedUser };
  const devBypassEnabled = isDevAuthBypassEnabled({
    nodeEnv: env.NODE_ENV,
    allowDevAuthBypass: env.ALLOW_DEV_AUTH_BYPASS,
  });
  if (session.authSource === 'dev_bypass' && !devBypassEnabled) return null;
  const isDevBypassSession = session.authSource === 'dev_bypass';
  if (isDevBypassSession) {
    // Keep explicit dev bypass role from the login token even if DB row has client role.
    session = { ...session, user: { ...session.user, role: decoded.user.role } };
  }
  if (session.user.role === 'doctor') {
    session = {
      ...buildSession(session.user),
      ...(isDevBypassSession ? { authSource: 'dev_bypass' as const } : {}),
      postLoginHints: session.postLoginHints,
      reauth: session.reauth,
      staffSecurity: session.staffSecurity,
    };
  }

  let verifiedEmail: string | undefined;
  // Email elevation is independent from legacy phone/TG/MAX bindings. It is
  // evaluated fresh on every non-dev session and is never projected into
  // platform_users.role.
  if (!isDevBypassSession && isPlatformUserUuid(session.user.userId)) {
    try {
      verifiedEmail = await runWithStaffSecuritySelfPrincipal(
        session.user.userId,
        'getCurrentSession:verified-email-role-resolution',
        async () => {
          return (await requireSessionUserPort().getVerifiedEmailForUser(session.user.userId)) ?? undefined;
        },
      );
    } catch {
      // The access elevation is fail-closed; an existing client session remains a client session.
      verifiedEmail = undefined;
    }
  }
  if (isDevBypassSession) return finalizeCurrentSession(session, patientOrganizationHint, options);

  // C-4 (2026-07-26, ADMIN_ACCESS_MODEL.md): admin/doctor used to be re-derived from the
  // messenger/phone allowlists on every session refresh and PERSISTED over `session.user.role`
  // whenever it differed. That path could only ever demote — `resolveRoleAsync` never promotes
  // anyone anymore, see envRole.ts — and would have overwritten a legitimately DB-persisted
  // staff role (e.g. the demo doctor account, whose bound phone used to also appear in
  // `doctor_phones`) back to "client" on every request. `session.user.role` here is already the
  // fresh `platform_users.role` (from `resolveSessionIdentityAgainstDb` above) or, for a
  // non-DB-backed identity, the cookie's own role, which self-registration can never make staff
  // (ADMIN_ACCESS_MODEL.md) — so it is used as-is; the lists are not consulted at all.
  const nextSession = session;

  if (await isVerifiedEmailGlobalAdminAsync(verifiedEmail)) {
    const emailAdminSession: AppSession = {
      ...buildSession({ ...nextSession.user, role: 'admin' }),
      postLoginHints: nextSession.postLoginHints,
      reauth: nextSession.reauth,
      staffSecurity: nextSession.staffSecurity,
    };
    return finalizeCurrentSession(emailAdminSession, patientOrganizationHint, options);
  }

  return finalizeCurrentSession(nextSession, patientOrganizationHint, options);
}

/**
 * Normal session resolution plus the standard organization-derived DB principal stamp.
 * Use {@link getCurrentSessionForIdentitySelf} for the deliberately narrow personal
 * surfaces that must not resolve or preserve an organization membership.
 */
export async function getCurrentSession(): Promise<AppSession | null> {
  return getCurrentSessionWithPrincipalMode();
}

/**
 * Resolves and verifies the signed session (including verified-email global-admin
 * elevation), but deliberately does not resolve an organization or stamp a staff
 * principal. The caller must authorize its narrow personal capability and install the
 * exact identity-self principal before any DB work.
 */
export async function getCurrentSessionForIdentitySelf(): Promise<AppSession | null> {
  return getCurrentSessionWithPrincipalMode({ stampDbPrincipal: false });
}

/**
 * Выход. Clears the client cookie AND — C-1 (2026-07-26) — increments
 * `platform_users.session_epoch` for the signed-out user, so a cookie copied before this call stops
 * being accepted the next time it is resolved against the DB (see the chokepoint in
 * `getCurrentSessionWithPrincipalMode` above). Previously this function ONLY cleared the cookie; a
 * copied session kept working after logout for up to its full TTL. The DB increment is best-effort:
 * a transient DB failure must not stop the user from clearing their own browser cookie.
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const decoded = raw ? decodeSessionCookie(raw) : null;
  if (decoded?.user && isPlatformUserUuid(decoded.user.userId) && env.DATABASE_URL?.trim()) {
    try {
      await runWithStaffSecuritySelfPrincipal(
        decoded.user.userId,
        'auth/clearSession:self',
        async () => {
          await requireSessionUserPort().invalidateSessionsForSelf();
        },
      );
    } catch {
      /* Best-effort revocation stamp: logout must still clear the cookie even if the DB write fails. */
    }
  }
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: 0,
  });
  clearFreshLoginMarkerCookie(cookieStore);
}

/**
 * Устанавливает сессию по пользователю (OAuth callback, phone confirm, и т.д.).
 * Вызывать только из route handlers / server actions (запись cookie). Для production-`client` ожидается UUID канона.
 */
export async function setSessionFromUser(
  user: SessionUser,
  opts?: {
    postLoginHints?: AppSession['postLoginHints'];
    staffSecurity?: AppSession['staffSecurity'];
  },
): Promise<void> {
  const session = buildSession(user);
  const full: AppSession = {
    ...session,
    ...(opts?.postLoginHints ? { postLoginHints: opts.postLoginHints } : {}),
    ...(opts?.staffSecurity ? { staffSecurity: opts.staffSecurity } : {}),
  };
  const cookieStore = await cookies();
  await persistNewAuthSession(cookieStore, full);
}

export async function clearDiaryPurgeReauth(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = raw ? decodeSessionCookie(raw) : null;
  if (!session) return;
  const next: AppSession = { ...session, reauth: undefined };
  cookieStore.set(SESSION_COOKIE_NAME, encodeSessionCookie(next), buildSessionCookieOptions(next));
}

export { SESSION_SLIDING_TTL_SECONDS } from '@/modules/auth/sessionCookie';

/**
 * Продлевает sliding TTL сессии в cookie (только route handlers / proxy).
 */
export async function renewSessionCookieFromRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return false;
  const session = decodeSessionCookie(raw);
  if (!session || !shouldRenewSession(session)) return false;
  const renewed = renewSessionIfActive(session);
  cookieStore.set(
    SESSION_COOKIE_NAME,
    encodeSessionCookie(renewed),
    buildRenewedSessionCookieOptions(renewed),
  );
  return true;
}
