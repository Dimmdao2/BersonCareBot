export type RegistrationErrorClass = "user" | "system";

const USER_ERROR_CODES = new Set([
  "invalid_body",
  "invalid_phone",
  "invalid_code",
  "expired_code",
  "too_many_attempts",
  "rate_limited",
  "duplicate_email",
  "email_conflict",
  "email_not_verified",
  "invalid_credentials",
  "channel_unavailable",
  "sms_disabled_web",
  "sms_disabled_by_policy",
  "sms_ru_only",
  "phone_required",
  "chat_id_required",
  "challenge_id_and_code_required",
  "oauth_disabled",
  "oauth_csrf",
  "no_code",
  "no_identity",
  "email_ambiguous",
  "not_ready",
  "not_found",
  "already_consumed",
  "existing_account_needs_email_setup",
  "access_denied",
]);

const SYSTEM_ERROR_CODES = new Set([
  "db_error",
  "server_error",
  "send_failed",
  "delivery_failed",
  "session_failed",
  "exchange_failed",
  "userinfo_failed",
  "proxy_configuration",
  "config",
  "write_port_missing",
]);

/** Classify registration/auth error codes for observability routing. */
export function classifyRegistrationErrorCode(errorCode: string): RegistrationErrorClass {
  const code = errorCode.trim();
  if (SYSTEM_ERROR_CODES.has(code)) return "system";
  if (USER_ERROR_CODES.has(code)) return "user";
  return "system";
}
