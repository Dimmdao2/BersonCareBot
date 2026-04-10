import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env, isProduction } from "@/config/env";
import type { AppSession, SessionUser, UserRole } from "@/shared/types/session";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";
import { decodeBase64Url, encodeBase64Url } from "@/shared/utils/base64url";
import { resolveRoleAsync, isWhitelistedAsync } from "./envRole";
import type { IdentityResolutionPort, MessengerIdentityResolutionHints } from "./identityResolutionPort";
import { normalizePhone } from "./phoneAuth";
import { isValidPhoneE164 } from "./phoneValidation";
import { getRedirectPathForRole } from "./redirectPolicy";
import { getIntegratorWebappEntrySecret, getTelegramBotToken } from "@/modules/system-settings/integrationRuntime";
import {
  verifyTelegramLoginWidgetSignature,
  type TelegramLoginWidgetPayload,
} from "./telegramLoginVerify";

const TELEGRAM_INIT_DATA_MAX_AGE_SEC = 3600; // 1 hour

const SESSION_COOKIE_NAME = "bersoncare_webapp_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 дней (пациент / client)
/** Доктор: 90 суток в браузере, как и пациент (слетающая сессия мешает работе). */
const SESSION_TTL_DOCTOR_SECONDS = 60 * 60 * 24 * 90;

type IntegratorTokenPayload = {
  sub: string;
  role: UserRole;
  displayName?: string;
  phone?: string;
  /** Optional; see `contracts/webapp-entry-token.json`. */
  integratorUserId?: string;
  bindings?: Record<string, string | undefined>;
  purpose: "webapp-entry";
  exp: number;
};

type ExchangeResult = {
  session: AppSession;
  redirectTo: string;
};

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function buildSession(user: SessionUser): AppSession {
  const now = Math.floor(Date.now() / 1000);
  const ttl = user.role === "doctor" ? SESSION_TTL_DOCTOR_SECONDS : SESSION_TTL_SECONDS;
  return {
    user,
    issuedAt: now,
    expiresAt: now + ttl,
  };
}

function cookieMaxAgeSeconds(session: AppSession): number {
  return Math.max(0, session.expiresAt - Math.floor(Date.now() / 1000));
}

function encodeSession(session: AppSession): string {
  const payload = encodeBase64Url(JSON.stringify(session));
  const signature = sign(payload, env.SESSION_COOKIE_SECRET);
  return `${payload}.${signature}`;
}

function decodeSession(raw: string): AppSession | null {
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload, env.SESSION_COOKIE_SECRET))) return null;

  let parsed: AppSession;
  try {
    parsed = JSON.parse(decodeBase64Url(payload)) as AppSession;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  return parsed.expiresAt > now ? parsed : null;
}

/**
 * Подтягивает актуальные ФИО/телефон/bindings из БД и отсекает сессии после удаления строки в `platform_users`
 * (например ops `reset-user`), когда cookie ещё валиден по подписи.
 */
async function resolveSessionUserAgainstDb(user: SessionUser): Promise<SessionUser | null> {
  if (!env.DATABASE_URL?.trim()) return user;
  if (!isPlatformUserUuid(user.userId)) return user;
  try {
    const { pgUserByPhonePort } = await import("@/infra/repos/pgUserByPhone");
    const fresh = await pgUserByPhonePort.findByUserId(user.userId);
    if (!fresh) return null;
    return fresh;
  } catch {
    return user;
  }
}

async function parseIntegratorToken(token: string): Promise<IntegratorTokenPayload | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const entrySecret = (await getIntegratorWebappEntrySecret()).trim();
  if (!entrySecret || !safeEqual(signature, sign(payload, entrySecret))) return null;

  let parsed: IntegratorTokenPayload;
  try {
    parsed = JSON.parse(decodeBase64Url(payload)) as IntegratorTokenPayload;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (parsed.purpose !== "webapp-entry" || parsed.exp <= now) {
    if (process.env.NODE_ENV !== "test") {
      console.info("[auth/parseToken] rejected purpose=%s expired=%s delta=%ds sub=%s",
        parsed.purpose, parsed.exp <= now, parsed.exp - now, parsed.sub);
    }
    return null;
  }
  return parsed;
}

function parseDevBypassToken(token: string): IntegratorTokenPayload | null {
  if (env.NODE_ENV === "production") return null;
  if (!env.ALLOW_DEV_AUTH_BYPASS) return null;

  const presets: Record<string, IntegratorTokenPayload> = {
    "dev:client": {
      sub: "dev-client",
      role: "client",
      displayName: "Demo Client",
      phone: "+79990000001",
      bindings: { telegramId: "111111111" },
      purpose: "webapp-entry",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    "dev:doctor": {
      sub: "dev-doctor",
      role: "doctor",
      displayName: "Demo Doctor",
      phone: "+79990000002",
      bindings: { telegramId: "222222222" },
      purpose: "webapp-entry",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    "dev:admin": {
      sub: "dev-admin",
      role: "admin",
      displayName: "Demo Admin",
      phone: "+79990000003",
      bindings: { telegramId: "333333333" },
      purpose: "webapp-entry",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
  };

  return presets[token] ?? null;
}


async function isAllowedByWhitelist(
  parsed: IntegratorTokenPayload,
  identityResolutionPort?: IdentityResolutionPort | null
): Promise<boolean> {
  if (parsed.role === "admin") return true;
  const eff = effectiveMessengerBinding(parsed);
  const tokenIds = {
    telegramId: eff?.channelCode === "telegram" ? eff.externalId : parsed.bindings?.telegramId,
    maxId: eff?.channelCode === "max" ? eff.externalId : parsed.bindings?.maxId,
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
function bindingFromExternalSub(sub: string): { channelCode: "telegram" | "max"; externalId: string } | null {
  const s = sub.trim();
  const tg = /^tg:(\d+)$/.exec(s);
  if (tg) return { channelCode: "telegram", externalId: tg[1]! };
  const max = /^max:(.+)$/.exec(s);
  if (max) {
    const id = max[1]!.trim();
    if (id.length > 0) return { channelCode: "max", externalId: id };
  }
  return null;
}

function effectiveMessengerBinding(
  parsed: IntegratorTokenPayload,
): { channelCode: "telegram" | "max" | "vk"; externalId: string } | null {
  return firstBinding(parsed) ?? bindingFromExternalSub(parsed.sub);
}

/** Optional signed webapp-entry token must denote the same messenger identity as the verified channel (no raw client UUID trust). */
function webappEntryTokenMatchesVerifiedMessenger(
  tokenPayload: IntegratorTokenPayload,
  channelCode: "telegram" | "max" | "vk",
  externalId: string,
): boolean {
  const eff = effectiveMessengerBinding(tokenPayload);
  if (!eff) return false;
  return eff.channelCode === channelCode && eff.externalId === externalId;
}

/** Validates Telegram Web App initData (from window.Telegram.WebApp.initData). Returns user id and role or null. */
async function validateTelegramInitData(
  initData: string,
): Promise<{ telegramId: string; role: UserRole; displayName?: string; startParam?: string } | null> {
  const botToken = (await getTelegramBotToken()).trim();
  if (!botToken?.trim()) return null;

  const params = new URLSearchParams(initData.trim());
  const hash = params.get("hash");
  if (!hash) return null;

  const authDate = params.get("auth_date");
  if (!authDate) return null;
  const authTs = Number(authDate);
  if (!Number.isFinite(authTs)) return null;
  if (Math.floor(Date.now() / 1000) - authTs > TELEGRAM_INIT_DATA_MAX_AGE_SEC) return null;

  const dataCheckParts: string[] = [];
  for (const key of [...params.keys()].sort()) {
    if (key === "hash") continue;
    dataCheckParts.push(`${key}=${params.get(key)!}`);
  }
  const dataCheckString = dataCheckParts.join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!safeEqual(computedHash, hash.toLowerCase())) return null;

  const userJson = params.get("user");
  if (!userJson) return null;
  let user: { id?: number; first_name?: string; last_name?: string };
  try {
    user = JSON.parse(userJson) as { id?: number; first_name?: string; last_name?: string };
  } catch {
    return null;
  }
  const telegramId = user.id != null ? String(user.id) : "";
  if (!telegramId) return null;

  if (!(await isWhitelistedAsync({ telegramId }))) return null;

  const role: UserRole = await resolveRoleAsync({ telegramId });
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || undefined;

  const startParamRaw = params.get("start_param");
  const startParam =
    startParamRaw != null && startParamRaw.trim() !== "" ? startParamRaw.trim() : undefined;

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

function firstBinding(parsed: IntegratorTokenPayload): { channelCode: "telegram" | "max" | "vk"; externalId: string } | null {
  if (parsed.bindings?.telegramId) return { channelCode: "telegram", externalId: parsed.bindings.telegramId };
  if (parsed.bindings?.maxId) return { channelCode: "max", externalId: parsed.bindings.maxId };
  if (parsed.bindings?.vkId) return { channelCode: "vk", externalId: parsed.bindings.vkId };
  return null;
}

/** Signed webapp-entry token → hints for `findOrCreateByChannelBinding` (Phase B: canon before INSERT). */
function messengerResolutionHintsFromToken(parsed: IntegratorTokenPayload): MessengerIdentityResolutionHints | undefined {
  const hints: MessengerIdentityResolutionHints = {};
  const sub = parsed.sub.trim();
  if (isPlatformUserUuid(sub)) {
    hints.platformUserSub = sub;
  }
  const intRaw = parsed.integratorUserId;
  if (typeof intRaw === "string" && intRaw.trim() !== "") {
    hints.integratorUserId = intRaw.trim();
  }
  const phoneRaw = parsed.phone;
  if (typeof phoneRaw === "string" && phoneRaw.trim() !== "") {
    const n = normalizePhone(phoneRaw.trim());
    if (isValidPhoneE164(n)) {
      hints.phoneNormalized = n;
    }
  }
  if (hints.platformUserSub == null && hints.integratorUserId == null && hints.phoneNormalized == null) {
    return undefined;
  }
  return hints;
}

async function optionalResolutionHintsFromVerifiedWebappEntryToken(
  embeddedToken: string | null | undefined,
  verifiedBinding: { channelCode: "telegram" | "max" | "vk"; externalId: string },
): Promise<MessengerIdentityResolutionHints | undefined> {
  const raw = embeddedToken?.trim();
  if (!raw) return undefined;
  const parsed = await parseIntegratorToken(raw);
  if (!parsed) return undefined;
  if (!webappEntryTokenMatchesVerifiedMessenger(parsed, verifiedBinding.channelCode, verifiedBinding.externalId)) {
    return undefined;
  }
  return messengerResolutionHintsFromToken(parsed);
}

export async function exchangeIntegratorToken(
  token: string,
  identityResolutionPort?: IdentityResolutionPort | null,
  updateRoleFn?: ((platformUserId: string, role: string) => Promise<void>) | null,
): Promise<ExchangeResult | null> {
  const devParsed = parseDevBypassToken(token);
  const parsed = devParsed ?? (await parseIntegratorToken(token));
  if (!parsed) {
    if (process.env.NODE_ENV !== "test") {
      console.info("[auth/exchange] token_parse_failed tokenLen=%d", token.length);
    }
    return null;
  }

  if (!devParsed && !(await isAllowedByWhitelist(parsed, identityResolutionPort))) {
    if (process.env.NODE_ENV !== "test") {
      console.info("[auth/exchange] whitelist_rejected sub=%s telegramId=%s", parsed.sub, parsed.bindings?.telegramId);
    }
    return null;
  }

  let user: SessionUser;
  if (identityResolutionPort && !devParsed) {
    const binding = effectiveMessengerBinding(parsed);
    if (binding) {
      const resolutionHints = messengerResolutionHintsFromToken(parsed);
      user = await identityResolutionPort.findOrCreateByChannelBinding({
        channelCode: binding.channelCode,
        externalId: binding.externalId,
        displayName: parsed.displayName,
        role: parsed.role,
        ...(resolutionHints ? { resolutionHints } : {}),
      });
    } else {
      user = tokenToUser(parsed);
    }
  } else {
    user = tokenToUser(parsed);
  }

  const envRole = await resolveRoleAsync({
    phone: user.phone ?? parsed.phone,
    telegramId: user.bindings?.telegramId ?? parsed.bindings?.telegramId,
    maxId: user.bindings?.maxId ?? parsed.bindings?.maxId,
  });
  if (user.role !== envRole) {
    if (updateRoleFn) await updateRoleFn(user.userId, envRole);
    user = { ...user, role: envRole };
  }

  const session = buildSession(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: cookieMaxAgeSeconds(session),
  });

  return {
    session,
    redirectTo: getRedirectPathForRole(user.role),
  };
}

/** Validates Telegram Web App initData and creates session. Used when user opens Mini App without ?t= token. */
export async function exchangeTelegramInitData(
  initData: string,
  identityResolutionPort?: IdentityResolutionPort | null,
  updateRoleFn?: ((platformUserId: string, role: string) => Promise<void>) | null,
): Promise<ExchangeResult | null> {
  const parsed = await validateTelegramInitData(initData);
  if (!parsed) return null;

  const verifiedBinding = { channelCode: "telegram" as const, externalId: parsed.telegramId };
  const resolutionHints = await optionalResolutionHintsFromVerifiedWebappEntryToken(
    parsed.startParam,
    verifiedBinding,
  );
  if (resolutionHints && process.env.NODE_ENV !== "test") {
    const kinds = [
      resolutionHints.platformUserSub && "sub",
      resolutionHints.integratorUserId && "integrator",
      resolutionHints.phoneNormalized && "phone",
    ]
      .filter(Boolean)
      .join(",");
    console.info("[auth/telegram-init] resolution_hints_from=start_param kinds=%s", kinds);
  }

  let user: SessionUser;
  if (identityResolutionPort) {
    user = await identityResolutionPort.findOrCreateByChannelBinding({
      channelCode: "telegram",
      externalId: parsed.telegramId,
      displayName: parsed.displayName,
      role: parsed.role,
      ...(resolutionHints ? { resolutionHints } : {}),
    });
  } else {
    user = {
      userId: `tg:${parsed.telegramId}`,
      role: parsed.role,
      displayName: parsed.displayName ?? parsed.telegramId,
      bindings: { telegramId: parsed.telegramId },
    };
  }

  const envRole = await resolveRoleAsync({
    phone: user.phone,
    telegramId: parsed.telegramId,
    maxId: user.bindings?.maxId,
  });
  if (user.role !== envRole) {
    if (updateRoleFn) await updateRoleFn(user.userId, envRole);
    user = { ...user, role: envRole };
  }

  const session = buildSession(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: cookieMaxAgeSeconds(session),
  });

  return {
    session,
    redirectTo: getRedirectPathForRole(user.role),
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

  const fn = typeof raw.first_name === "string" ? raw.first_name.trim() : "";
  const ln = typeof raw.last_name === "string" ? raw.last_name.trim() : "";
  const displayName = [fn, ln].filter(Boolean).join(" ").trim();

  const role = await resolveRoleAsync({ telegramId });

  const verifiedBinding = { channelCode: "telegram" as const, externalId: telegramId };
  const resolutionHints = await optionalResolutionHintsFromVerifiedWebappEntryToken(
    webappEntryToken,
    verifiedBinding,
  );
  if (resolutionHints && process.env.NODE_ENV !== "test") {
    const kinds = [
      resolutionHints.platformUserSub && "sub",
      resolutionHints.integratorUserId && "integrator",
      resolutionHints.phoneNormalized && "phone",
    ]
      .filter(Boolean)
      .join(",");
    console.info("[auth/telegram-login] resolution_hints_from=webapp_entry_token kinds=%s", kinds);
  }

  let user: SessionUser;
  if (identityResolutionPort) {
    user = await identityResolutionPort.findOrCreateByChannelBinding({
      channelCode: "telegram",
      externalId: telegramId,
      displayName: displayName || undefined,
      role,
      ...(resolutionHints ? { resolutionHints } : {}),
    });
  } else {
    user = {
      userId: `tg:${telegramId}`,
      role,
      displayName: displayName || telegramId,
      bindings: { telegramId },
    };
  }

  const envRole = await resolveRoleAsync({
    phone: user.phone,
    telegramId,
    maxId: user.bindings?.maxId,
  });
  if (user.role !== envRole) {
    if (updateRoleFn) await updateRoleFn(user.userId, envRole);
    user = { ...user, role: envRole };
  }

  const session = buildSession(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: cookieMaxAgeSeconds(session),
  });

  return {
    session,
    redirectTo: getRedirectPathForRole(user.role),
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
export async function getCurrentSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const decoded = raw ? decodeSession(raw) : null;
  if (!decoded?.user) {
    if (raw && process.env.NODE_ENV !== "production") {
      console.info("[auth] session_cookie_invalid_or_expired");
    }
    return null;
  }

  const resolvedUser = await resolveSessionUserAgainstDb(decoded.user);
  if (resolvedUser === null) return null;

  // Normalize doctor session shape without writing cookie here — cookies().set()
  // is only allowed in Server Actions / Route Handlers, not in Server Component render.
  let session: AppSession = { ...decoded, user: resolvedUser };
  if (session.user.role === "doctor") {
    session = {
      ...buildSession(session.user),
      postLoginHints: session.postLoginHints,
      adminMode: session.adminMode,
      reauth: session.reauth,
    };
  }

  const phone = session.user.phone?.trim();
  const telegramId = session.user.bindings?.telegramId?.trim();
  const maxId = session.user.bindings?.maxId?.trim();
  if (!phone && !telegramId && !maxId) return session;

  const envRole = await resolveRoleAsync({ phone, telegramId, maxId });
  if (session.user.role === envRole) return session;

  const nextUser = { ...session.user, role: envRole };
  const nextSession: AppSession = {
    ...buildSession(nextUser),
    postLoginHints: session.postLoginHints,
    adminMode: session.adminMode,
    reauth: session.reauth,
  };

  if (env.DATABASE_URL) {
    try {
      const { pgUserProjectionPort } = await import("@/infra/repos/pgUserProjection");
      await pgUserProjectionPort.updateRole(session.user.userId, envRole);
    } catch {
      /* ignore: in-memory tests or DB unavailable */
    }
  }

  // Cookie update skipped intentionally: mutating cookies in Server Component render
  // is forbidden by Next.js. The role is correct in the returned session object;
  // the cookie will be rewritten on the next Server Action or login.
  return nextSession;
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  });
}

/** Переключает adminMode в текущей сессии (только для role === 'admin'). */
export async function toggleAdminMode(): Promise<{ ok: boolean; adminMode?: boolean }> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = raw ? decodeSession(raw) : null;
  if (!session || session.user.role !== "admin") return { ok: false };

  const nextAdminMode = !session.adminMode;
  const nextSession: AppSession = { ...session, adminMode: nextAdminMode };

  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(nextSession), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: cookieMaxAgeSeconds(nextSession),
  });

  return { ok: true, adminMode: nextAdminMode };
}

/** Устанавливает сессию по пользователю (для входа по SMS и др.). */
export async function setSessionFromUser(
  user: SessionUser,
  opts?: { postLoginHints?: AppSession["postLoginHints"] }
): Promise<void> {
  const session = buildSession(user);
  const full: AppSession = opts?.postLoginHints ? { ...session, postLoginHints: opts.postLoginHints } : session;
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(full), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: cookieMaxAgeSeconds(full),
  });
}

/** TTL повторного подтверждения PIN перед удалением дневников (секунды). */
export const DIARY_PURGE_PIN_REAUTH_TTL_SEC = 600;

export function isDiaryPurgePinReauthValid(session: AppSession | null): boolean {
  if (!session?.reauth?.diaryPurgePinVerifiedUntil) return false;
  return Math.floor(Date.now() / 1000) <= session.reauth.diaryPurgePinVerifiedUntil;
}

export async function setDiaryPurgePinReauth(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = raw ? decodeSession(raw) : null;
  if (!session) return;
  const until = Math.floor(Date.now() / 1000) + DIARY_PURGE_PIN_REAUTH_TTL_SEC;
  const next: AppSession = {
    ...session,
    reauth: { ...session.reauth, diaryPurgePinVerifiedUntil: until },
  };
  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(next), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: cookieMaxAgeSeconds(next),
  });
}

export async function clearDiaryPurgeReauth(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = raw ? decodeSession(raw) : null;
  if (!session) return;
  const next: AppSession = { ...session, reauth: undefined };
  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(next), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: cookieMaxAgeSeconds(next),
  });
}
