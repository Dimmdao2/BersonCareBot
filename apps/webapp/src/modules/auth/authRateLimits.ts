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

const isChannelLinkStartRateLimitedCore = createSlidingWindowRateLimit({
  scope: 'auth.channel_link_start',
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 30,
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
