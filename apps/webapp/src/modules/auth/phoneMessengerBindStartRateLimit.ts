/** Подсказка клиенту при 429 (скользящее окно 1 ч). */
export const PHONE_MESSENGER_BIND_START_RATE_LIMIT_SEC = 3600;

export { isPhoneMessengerBindStartRateLimited } from "@/modules/auth/authRateLimits";
