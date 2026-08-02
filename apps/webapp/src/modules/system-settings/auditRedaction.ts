/**
 * Credential redaction for the settings AUDIT trail (the log line and the durable
 * `system_settings_audit` ledger).
 *
 * Why this exists as one shared helper: an independent audit (2026-07-27) found the new
 * `operator_health_imap` password reaching both the admin log line and `new_value_json`, because the
 * log-side redactor was a per-key `if` chain in the route and the ledger had no redaction at all.
 * A ledger row is worse than a log line — it is durable, it is read back by the audit UI, and it
 * survives log rotation. So the ledger and the log now share one list.
 *
 * Scope note: this does NOT make `system_settings` itself safe — values are stored there as given
 * (see the SMTP password today). Encrypting settings at rest is a separate, owner-gated decision.
 */

/** Envelope-shaped settings whose `value.password` must never be copied into the audit trail. */
const PASSWORD_BEARING_KEYS = new Set<string>([
  'smtp_outbound',
  'clinic_smtp_outbound',
  'operator_health_imap',
]);

/**
 * Settings whose ENTIRE value is a credential — a bare string, not an envelope with a `password`
 * field. Found by an independent audit (2026-07-28) on `vk_id_client_secret`: the route's log line
 * masks it, but the durable ledger stored it verbatim, because the only redactor understood the
 * envelope shape and silently passed a scalar through. The same hole covered the Google and Yandex
 * secrets, which nobody had flagged.
 *
 * Rule for adding to this list: if the value IS the secret, it belongs here; if the secret sits in
 * `value.password`, it belongs in PASSWORD_BEARING_KEYS above.
 */
const SECRET_VALUE_KEYS = new Set<string>([
  'max_bot_api_key',
  'max_webhook_secret',
  'telegram_bot_token',
  'telegram_webhook_secret',
  'yandex_oauth_client_secret',
  'vk_id_client_secret',
  'google_client_secret',
  'google_refresh_token',
  'apple_oauth_private_key',
  'smsc_api_key',
  'clinic_smsc_api_key',
  'clinic_telegram_bot_token',
  'clinic_max_bot_api_key',
  'auth_altcha_hmac_secret',
]);

function redactEnvelopePassword(envelope: unknown): unknown {
  if (envelope === null || typeof envelope !== 'object') return envelope;
  if (!('value' in envelope)) return envelope;
  const inner = (envelope as Record<string, unknown>).value;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return envelope;
  const o = { ...(inner as Record<string, unknown>) };
  if ('password' in o) {
    const p = typeof o.password === 'string' ? o.password.trim() : '';
    o.password = p.length > 0 ? '[REDACTED]' : '';
  }
  return { ...(envelope as Record<string, unknown>), value: o };
}

/**
 * Returns the value as it may be persisted to `system_settings_audit` / written to a log line.
 * Unknown keys pass through unchanged — this is a redactor, not an allowlist gate.
 */
export function redactSettingValueForAudit(key: string, value: unknown): unknown {
  if (PASSWORD_BEARING_KEYS.has(key)) return redactEnvelopePassword(value);
  if (SECRET_VALUE_KEYS.has(key)) {
    // An empty value is not a secret and stays visible, so the trail still shows "it was cleared".
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.trim().length > 0 ? '[REDACTED]' : value;
    return '[REDACTED]';
  }
  return value;
}

export function isPasswordBearingSettingKey(key: string): boolean {
  return PASSWORD_BEARING_KEYS.has(key);
}

/** True when the whole setting value is a credential (scalar secret), not an envelope. */
export function isSecretValueSettingKey(key: string): boolean {
  return SECRET_VALUE_KEYS.has(key);
}
