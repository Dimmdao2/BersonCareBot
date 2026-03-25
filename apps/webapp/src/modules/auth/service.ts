import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env, integratorWebappEntrySecret, isProduction } from "@/config/env";
import type { AppSession, SessionUser, UserRole } from "@/shared/types/session";
import { decodeBase64Url, encodeBase64Url } from "@/shared/utils/base64url";
import { resolveRoleFromEnv, getNormalizedWhitelistedPhonesFromEnv } from "./envRole";
import type { IdentityResolutionPort } from "./identityResolutionPort";
import { normalizePhone } from "./phoneAuth";
import { getRedirectPathForRole } from "./redirectPolicy";

const TELEGRAM_INIT_DATA_MAX_AGE_SEC = 3600; // 1 hour

const SESSION_COOKIE_NAME = "bersoncare_webapp_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
/** Доктор: до 7 суток + продление при активности (см. getCurrentSession). */
const SESSION_TTL_DOCTOR_SECONDS = 60 * 60 * 24 * 7;

type IntegratorTokenPayload = {
  sub: string;
  role: UserRole;
  displayName?: string;
  phone?: string;
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

function parseIntegratorToken(token: string): IntegratorTokenPayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload, integratorWebappEntrySecret()))) return null;

  let parsed: IntegratorTokenPayload;
  try {
    parsed = JSON.parse(decodeBase64Url(payload)) as IntegratorTokenPayload;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (parsed.purpose !== "webapp-entry" || parsed.exp <= now) return null;
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

function getAllowedTelegramIds(): Set<string> {
  const ids = new Set<string>();
  const raw = env.ALLOWED_TELEGRAM_IDS?.trim() ?? "";
  for (const s of raw.split(",")) {
    const t = s.trim();
    if (t) ids.add(t);
  }
  if (typeof env.ADMIN_TELEGRAM_ID === "number") {
    ids.add(String(env.ADMIN_TELEGRAM_ID));
  }
  const doctorRaw = env.DOCTOR_TELEGRAM_IDS?.trim() ?? "";
  for (const s of doctorRaw.split(",")) {
    const t = s.trim();
    if (t) ids.add(t);
  }
  return ids;
}

function getAllowedMaxIds(): Set<string> {
  const ids = new Set<string>();
  const raw = env.ALLOWED_MAX_IDS?.trim() ?? "";
  for (const s of raw.split(",")) {
    const t = s.trim();
    if (t) ids.add(t);
  }
  for (const s of (env.ADMIN_MAX_IDS ?? "").split(",")) {
    const t = s.trim();
    if (t) ids.add(t);
  }
  for (const s of (env.DOCTOR_MAX_IDS ?? "").split(",")) {
    const t = s.trim();
    if (t) ids.add(t);
  }
  return ids;
}

function isAllowedByWhitelist(parsed: IntegratorTokenPayload): boolean {
  if (parsed.role === "admin") return true;
  const telegramId = parsed.bindings?.telegramId;
  const maxId = parsed.bindings?.maxId;
  if (telegramId && getAllowedTelegramIds().has(telegramId)) return true;
  if (maxId && getAllowedMaxIds().has(maxId)) return true;
  const phone = parsed.phone?.trim();
  if (phone && getNormalizedWhitelistedPhonesFromEnv().has(normalizePhone(phone))) return true;
  return false;
}

/** Validates Telegram Web App initData (from window.Telegram.WebApp.initData). Returns user id and role or null. */
function validateTelegramInitData(initData: string): { telegramId: string; role: UserRole; displayName?: string } | null {
  const botToken = env.TELEGRAM_BOT_TOKEN;
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

  const allowed = getAllowedTelegramIds();
  if (!allowed.has(telegramId)) return null;

  const role: UserRole = resolveRoleFromEnv({});
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || undefined;

  return { telegramId, role, displayName };
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

export async function exchangeIntegratorToken(
  token: string,
  identityResolutionPort?: IdentityResolutionPort | null,
  updateRoleFn?: ((platformUserId: string, role: string) => Promise<void>) | null,
): Promise<ExchangeResult | null> {
  const devParsed = parseDevBypassToken(token);
  const parsed = devParsed ?? parseIntegratorToken(token);
  if (!parsed) return null;

  if (!devParsed && !isAllowedByWhitelist(parsed)) return null;

  let user: SessionUser;
  if (identityResolutionPort && !devParsed) {
    const binding = firstBinding(parsed);
    if (binding) {
      user = await identityResolutionPort.findOrCreateByChannelBinding({
        channelCode: binding.channelCode,
        externalId: binding.externalId,
        displayName: parsed.displayName,
        role: parsed.role,
      });
    } else {
      user = tokenToUser(parsed);
    }
  } else {
    user = tokenToUser(parsed);
  }

  const envRole = resolveRoleFromEnv({
    phone: user.phone ?? parsed.phone,
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
  const parsed = validateTelegramInitData(initData);
  if (!parsed) return null;

  let user: SessionUser;
  if (identityResolutionPort) {
    user = await identityResolutionPort.findOrCreateByChannelBinding({
      channelCode: "telegram",
      externalId: parsed.telegramId,
      displayName: parsed.displayName,
      role: parsed.role,
    });
  } else {
    user = {
      userId: `tg:${parsed.telegramId}`,
      role: parsed.role,
      displayName: parsed.displayName ?? parsed.telegramId,
      bindings: { telegramId: parsed.telegramId },
    };
  }

  const envRole = resolveRoleFromEnv({ phone: user.phone });
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
 * Если в сессии есть привязанный телефон, роль сверяется с ADMIN_PHONES / DOCTOR_PHONES.
 * Так пользователь мессенджера после привязки номера получает admin/doctor без повторного входа;
 * cookie и при наличии БД строка role в platform_users обновляются.
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

  let session = decoded;
  if (session.user.role === "doctor") {
    const slid = buildSession(session.user);
    cookieStore.set(SESSION_COOKIE_NAME, encodeSession(slid), {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: cookieMaxAgeSeconds(slid),
    });
    session = slid;
  }

  const phone = session.user.phone?.trim();
  if (!phone) return session;

  const envRole = resolveRoleFromEnv({ phone });
  if (session.user.role === envRole) return session;

  const nextUser = { ...session.user, role: envRole };
  const nextSession = buildSession(nextUser);

  if (env.DATABASE_URL) {
    try {
      const { pgUserProjectionPort } = await import("@/infra/repos/pgUserProjection");
      await pgUserProjectionPort.updateRole(session.user.userId, envRole);
    } catch {
      /* ignore: in-memory tests or DB unavailable */
    }
  }

  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(nextSession), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: cookieMaxAgeSeconds(nextSession),
  });

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
export async function setSessionFromUser(user: SessionUser): Promise<void> {
  const session = buildSession(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: cookieMaxAgeSeconds(session),
  });
}
