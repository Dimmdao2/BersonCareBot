import { createSlidingWindowRateLimit } from "@/modules/auth/createSlidingWindowRateLimit";
import type { AuthRateLimitDbPort } from "@/modules/auth/authRateLimitPort";

let authRateLimitDbPort: AuthRateLimitDbPort | undefined;

export function bindAuthRateLimitDbPort(port: AuthRateLimitDbPort): void {
  authRateLimitDbPort = port;
}

function requireAuthRateLimitDbPort(): AuthRateLimitDbPort {
  if (!authRateLimitDbPort) {
    throw new Error("AuthRateLimitDbPort is not bound. Call ensureAuthModulePortsBound() from buildAppDeps.");
  }
  return authRateLimitDbPort;
}

const authRateLimitDb: AuthRateLimitDbPort = {
  checkAndRecord: (params) => requireAuthRateLimitDbPort().checkAndRecord(params),
};

export const isCheckPhoneRateLimited = createSlidingWindowRateLimit({
  scope: "auth.check_phone",
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 40,
  db: authRateLimitDb,
  pruneBucketThreshold: 3000,
});

export const isOAuthStartRateLimitedByKey = createSlidingWindowRateLimit({
  scope: "auth.oauth_start",
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 60,
  db: authRateLimitDb,
});

export const isMessengerStartRateLimited = createSlidingWindowRateLimit({
  scope: "auth.messenger_start",
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 12,
  db: authRateLimitDb,
});

const isChannelLinkStartRateLimitedCore = createSlidingWindowRateLimit({
  scope: "auth.channel_link_start",
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
  scope: "auth.phone_messenger_bind_start",
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 30,
  db: authRateLimitDb,
});

export const isPublicBookingCreateRateLimited = createSlidingWindowRateLimit({
  scope: "booking.public_create",
  windowMs: 60 * 60 * 1000,
  maxPerWindow: 20,
  db: authRateLimitDb,
});
