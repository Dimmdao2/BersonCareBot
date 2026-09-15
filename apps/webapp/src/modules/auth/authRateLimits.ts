import { createSlidingWindowRateLimit } from '@/modules/auth/createSlidingWindowRateLimit';
import type { AuthRateLimitDbPort } from '@/modules/auth/authRateLimitPort';

let authRateLimitDbPort: AuthRateLimitDbPort | undefined;

export function bindAuthRateLimitDbPort(port: AuthRateLimitDbPort): void {
  authRateLimitDbPort = port;
}

function requireAuthRateLimitDbPort(): AuthRateLimitDbPort {
  if (!authRateLimitDbPort) {
    throw new Error(
      'AuthRateLimitDbPort is not bound. Call ensureAuthModulePortsBound() from buildAppDeps.',
    );
  }
  return authRateLimitDbPort;
}

const authRateLimitDb: AuthRateLimitDbPort = {
  checkAndRecord: (params) => requireAuthRateLimitDbPort().checkAndRecord(params),
  recordAndCount: (params) => requireAuthRateLimitDbPort().recordAndCount(params),
};

export function getAuthRateLimitDbPort(): AuthRateLimitDbPort {
  return authRateLimitDb;
}

export const isCheckPhoneRateLimited = createSlidingWindowRateLimit({
  scope: 'auth.check_phone',
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 40,
  db: authRateLimitDb,
  pruneBucketThreshold: 3000,
});

export const isOAuthStartRateLimitedByKey = createSlidingWindowRateLimit({
  scope: 'auth.oauth_start',
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 60,
  db: authRateLimitDb,
});

/** Per-IP limit for public email-OTP start (anti abuse/enumeration probing). */
export const isEmailOtpStartRateLimitedByKey = createSlidingWindowRateLimit({
  scope: 'auth.email_otp_start',
  windowMs: 60 * 1000,
  maxPerWindow: 10,
  db: authRateLimitDb,
});

/** Bounded unauthenticated client-compatibility telemetry ingress. */
export const isClientBootReportRateLimitedByKey = createSlidingWindowRateLimit({
  scope: 'patient.client_boot_report',
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 30,
  scopePrune: {
    retentionMs: 60 * 60 * 1000,
    intervalMs: 5 * 60 * 1000,
    batchSize: 500,
  },
  db: authRateLimitDb,
});

export const isMessengerStartRateLimited = createSlidingWindowRateLimit({
  scope: 'auth.messenger_start',
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 12,
  db: authRateLimitDb,
});

/**
 * The ONE limiter scope whose key is the raw platform user id, not an IP or a phone — so its rows
 * are the only ones in `auth_rate_limit_events` that name a person.
 *
 * Exhaustive lifecycle census audit 2026-08-28, F2: the registry called this table
 * "bounded by the limiter's own window", and that was only true of a key that keeps being called.
 * `app.auth_rate_limit_check_and_record` deletes expired rows of the CURRENT `(scope, key)` unless
 * the caller asks for a scope-wide prune, and after the last link attempt — certainly after the
 * account is deleted — there is no next call for that key. Measured: 15 rows carrying 11 distinct
 * `role='client'` uuids on bcb_webapp_dev, the same on bersoncarebot_test. The bounded, batched
 * scope prune already built for `patient.client_boot_report` closes it, with the same shape and the
 * same existing DB function; the deleted person's own key is additionally removed by the account
 * purge (`CONTENT_TABLES`).
 */
const isChannelLinkStartRateLimitedCore = createSlidingWindowRateLimit({
  scope: 'auth.channel_link_start',
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 30,
  scopePrune: {
    retentionMs: 60 * 60 * 1000,
    intervalMs: 5 * 60 * 1000,
    batchSize: 500,
  },
  db: authRateLimitDb,
});

export async function isChannelLinkStartRateLimited(userId: string): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;
  return isChannelLinkStartRateLimitedCore(uid);
}

export const isPhoneMessengerBindStartRateLimited = createSlidingWindowRateLimit({
  scope: 'auth.phone_messenger_bind_start',
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 30,
  db: authRateLimitDb,
});

/** Per-IP limit on the public booking INTENT step (issues an OTP; does not create a booking). */
export const isPublicBookingCreateRateLimited = createSlidingWindowRateLimit({
  scope: 'booking.public_create',
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 20,
  db: authRateLimitDb,
});

/**
 * Per-IP limit on the public LEAD submission (Д6 независимого аудита Л3).
 *
 * Своё ведро, а не общее с записью: раньше заявка считалась в `booking.public_create`, и два
 * несвязанных действия ели один бюджет — поток заявок закрывал клинике запись на приём, и наоборот.
 * Это ровно то разделение, ради которого рядом уже стоит пара `booking.public_create` /
 * `booking.public_create_confirm` (ASVS 2.4.1).
 *
 * Порог тот же, 20 в час: до этой строки заявка де-факто жила под ним же, и менять число значило бы
 * тихо поменять продуктовое поведение вместе с починкой дефекта.
 */
export const isPublicLeadSubmitRateLimited = createSlidingWindowRateLimit({
  scope: 'leads.public_submit',
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 20,
  db: authRateLimitDb,
});

/**
 * Per-IP limit on the public booking CONFIRM step, deliberately a separate scope and threshold so
 * code guessing cannot be funded out of the intent budget (ASVS 2.4.1). Shaped after the existing
 * `patient_invite.email_confirm` pair. The per-code attempt cap and the per-phone lockout are
 * enforced independently by `phoneOtpLimits`.
 */
export const isPublicBookingConfirmRateLimited = createSlidingWindowRateLimit({
  scope: 'booking.public_create_confirm',
  windowMs: 10 * 60 * 1000,
  maxPerWindow: 30,
  db: authRateLimitDb,
});

/**
 * Общий на ВСЕ двери регистрации потолок «один старт на адрес в минуту» (ключ — сам адрес).
 *
 * Стоит в самом начале маршрута, ДО любой проверки, есть ли такой аккаунт. Без него оставался
 * оракул перечисления, который нашёл четвёртый адверсарный аудит: свободный адрес на втором
 * отправлении внутри минуты получал 429 от кулдауна `startEmailChallenge`, а занятый — ровно тот
 * же нейтральный 200, потому что по нему кода никто не создаёт и кулдаун не тратится. Разница
 * ответов на двойной отправке и есть ответ на вопрос «есть ли тут аккаунт». Теперь на второй
 * отправке оба адреса получают один и тот же 429.
 */
export const isSignupStartRateLimitedByEmail = createSlidingWindowRateLimit({
  scope: 'auth.signup_start',
  windowMs: 60 * 1000,
  maxPerWindow: 1,
  db: authRateLimitDb,
  scopePrune: { retentionMs: 60 * 60 * 1000, intervalMs: 5 * 60 * 1000, batchSize: 500 },
});

/**
 * Потолок на письмо «кто-то пытается зарегистрироваться на ваш email» (ключ — сам адрес).
 * Форма регистрации специалиста отвечает успехом всегда, поэтому отправку может дёргать кто
 * угодно; без этого потолка чужой ящик можно было бы завалить письмами через нашу форму.
 */
export const isSpecialistSignupDuplicateNoticeRateLimitedByKey = createSlidingWindowRateLimit({
  scope: 'auth.specialist_signup_duplicate_notice',
  windowMs: 24 * 60 * 60 * 1000,
  maxPerWindow: 3,
  db: authRateLimitDb,
  // Окно суточное — без подчистки строки копятся сутками (замечание аудита N13).
  scopePrune: { retentionMs: 24 * 60 * 60 * 1000, intervalMs: 60 * 60 * 1000, batchSize: 500 },
});

export const isPatientInviteExchangeRateLimitedByKey = createSlidingWindowRateLimit({
  scope: 'patient_invite.exchange',
  windowMs: 60 * 1000,
  maxPerWindow: 20,
  db: authRateLimitDb,
});

export const isPatientInviteEmailStartRateLimitedByKey = createSlidingWindowRateLimit({
  scope: 'patient_invite.email_start',
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 8,
  db: authRateLimitDb,
});

export const isPatientInviteEmailConfirmRateLimitedByKey = createSlidingWindowRateLimit({
  scope: 'patient_invite.email_confirm',
  windowMs: 10 * 60 * 1000,
  maxPerWindow: 20,
  db: authRateLimitDb,
});

/**
 * Per-IP limit shared by confirm-shaped and password-proof routes.
 * ONE shared scope (single chokepoint) means an attacker rotating across these routes from the same
 * IP is bounded by the same budget instead of receiving a separate budget for every route.
 *
 * Threshold 30/10min matches `booking.public_create_confirm` (already proven in this repo) rather
 * than Cloudflare's stricter 5/5min OTP guidance, deliberately: a clinic's shared front-desk IP
 * confirming several patients' codes back-to-back must not be throttled. A limit that locks out a
 * real clinic is a defect (owner ruling, night plan C-2). Internal consistency with the two
 * existing proven confirm-shaped scopes: `booking.public_create_confirm` (30/10min) and
 * `patient_invite.email_confirm` (20/10min).
 */
export const isAuthConfirmRateLimitedByKey = createSlidingWindowRateLimit({
  scope: 'auth.confirm',
  windowMs: 10 * 60 * 1000,
  maxPerWindow: 30,
  db: authRateLimitDb,
});
