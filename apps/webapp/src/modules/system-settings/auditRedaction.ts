/**
 * Credential redaction for the settings AUDIT trail (the log line and the durable
 * `system_settings_audit` ledger).
 *
 * Why this exists as one shared helper: an independent audit (2026-07-27) found the new
 * `operator_health_imap` password reaching both the admin log line and `new_value_json`, because the
 * log-side redactor was a per-key `if` chain in the route and the ledger had no redaction at all.
 * A ledger row is worse than a log line — it is durable, it is read back by the audit UI, and it
 * survives log rotation. So the ledger and the log now share one call (`admin/settings/route.ts`'s
 * `PATCH`/batch handlers pass their log line through this same function).
 *
 * #1071: a second independent audit (2026-09-02) found the redaction policy itself was a
 * hand-maintained key list, disjoint from `SYSTEM_SETTING_REGISTRY` — `web_push_vapid`,
 * `booking_payment_providers` and `saas_billing_payment_provider` carry live secret material
 * (`value.privateKey`, `value.providers[].{webhookSecret,apiKey}`) but were in neither list, so
 * their plaintext reached `system_settings_audit` verbatim. The policy now lives on the registry
 * entry itself (`SystemSettingSecretAuditPolicy`, `registry.ts`) — one key, one classification,
 * checked by this module's `auditRedaction.unit.test.ts` registry-census tests — instead of a
 * second list that can silently diverge.
 *
 * Scope note: this does NOT make `system_settings` itself safe — values are stored there as given
 * (see the SMTP password today). Encrypting settings at rest is a separate, owner-gated decision
 * (`docs/_TODO/runs/INTEGRATION_SECRET_ENCRYPTION_DECISION_PACKET_2026-09-02.md`).
 */
import { SYSTEM_SETTING_REGISTRY, type SystemSettingSecretAuditPolicy } from './registry';
import { redactSaasBillingPaymentProviderValue } from '@/modules/saas-billing/settings';
import {
  parseBookingPaymentSettingsValue,
  redactBookingPaymentProvidersForClient,
} from '@/modules/payments/bookingPaymentSettings';

type RegistryLookup = Record<
  string,
  {
    secretAudit: SystemSettingSecretAuditPolicy;
    valueContract: string;
  } | undefined
>;

function definitionForKey(key: string): RegistryLookup[string] {
  return (SYSTEM_SETTING_REGISTRY as RegistryLookup)[key];
}

function policyForKey(key: string): SystemSettingSecretAuditPolicy {
  const definition = definitionForKey(key);
  // A key absent from the registry cannot be written through the chokepoint (`ALLOWED_KEYS` gates
  // it), so this only fires for a stale/foreign key reaching this function directly (e.g. a test).
  // Fail closed rather than guess it is safe to show.
  return definition?.secretAudit ?? { kind: 'whole_value' };
}

/** The expected shape for every composite secret: `{ value: { ...fields... } }`. */
function isCompositeEnvelope(value: unknown): value is { value: Record<string, unknown> } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!('value' in value)) return false;
  const inner = (value as Record<string, unknown>).value;
  return inner !== null && typeof inner === 'object' && !Array.isArray(inner);
}

function redactWholeValue(value: unknown): unknown {
  // Absent/cleared stays distinguishable from "configured" — it is not a credential to hide.
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.trim().length > 0 ? '[REDACTED]' : value;
  // A whole-value secret that isn't a bare string is not the shape this key is supposed to hold —
  // fail closed instead of passing an unrecognized shape through unredacted.
  return '[REDACTED]';
}

function redactObjectField(value: unknown, field: string): unknown {
  if (value === null || value === undefined) return value;
  if (!isCompositeEnvelope(value)) return '[REDACTED]';
  const inner = { ...value.value };
  if (!(field in inner)) return '[REDACTED]';
  const raw = inner[field];
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  inner[field] = trimmed.length > 0 ? '[REDACTED]' : '';
  return { ...value, value: inner };
}

function redactPublicScalarEnvelope(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object' || Array.isArray(value)) return '[REDACTED]';
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !('value' in record)) return '[REDACTED]';
  const inner = record.value;
  if (typeof inner !== 'string') return '[REDACTED]';
  return value;
}

function redactDomain(
  id: 'booking_payment_providers' | 'saas_billing_payment_provider',
  value: unknown,
): unknown {
  if (value === null || value === undefined) return value;
  if (!isCompositeEnvelope(value)) return '[REDACTED]';
  if (id === 'saas_billing_payment_provider') return redactSaasBillingPaymentProviderValue(value);
  return { value: redactBookingPaymentProvidersForClient(parseBookingPaymentSettingsValue(value)) };
}

/**
 * Returns the value as it may be persisted to `system_settings_audit` / written to a log line.
 * Every key is classified in `SYSTEM_SETTING_REGISTRY[key].secretAudit`; a key that cannot be
 * resolved there is treated as `whole_value` and redacted, not passed through.
 */
export function redactSettingValueForAudit(key: string, value: unknown): unknown {
  const policy = policyForKey(key);
  switch (policy.kind) {
    case 'none':
      return definitionForKey(key)?.valueContract === 'secret_envelope'
        ? redactPublicScalarEnvelope(value)
        : value;
    case 'whole_value':
      return redactWholeValue(value);
    case 'object_field':
      return redactObjectField(value, policy.field);
    case 'domain_redactor':
      return redactDomain(policy.id, value);
  }
}

/** True for the envelope-shaped settings whose `value.password` must never reach the audit trail. */
export function isPasswordBearingSettingKey(key: string): boolean {
  const policy = policyForKey(key);
  return policy.kind === 'object_field' && policy.field === 'password';
}

/** True when the whole setting value is a credential (scalar secret), not an envelope. */
export function isSecretValueSettingKey(key: string): boolean {
  return policyForKey(key).kind === 'whole_value';
}
