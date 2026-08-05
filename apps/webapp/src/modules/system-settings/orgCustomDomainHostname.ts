/** Per-org personal hostname intent; TLS/routing binding is a separate readiness stage. */
export const ORG_CUSTOM_DOMAIN_HOSTNAME_KEY = 'org_custom_domain_hostname' as const;

const MAX_HOSTNAME_LENGTH = 253;
const HOSTNAME_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export type NormalizeOrgCustomDomainHostnameResult =
  | { ok: true; valueJson: { value: string } }
  | { ok: false; error: 'invalid_value' };

function isPlausibleHostname(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > MAX_HOSTNAME_LENGTH) return false;
  if (hostname.includes('://') || hostname.includes('/') || hostname.includes(':')) return false;
  const labels = hostname.split('.');
  if (labels.length < 2) return false;
  return labels.every((label) => HOSTNAME_LABEL_RE.test(label));
}

/** Normalizes PATCH for the clinic personal domain name setting (admin scope, per-org). */
export function normalizeOrgCustomDomainHostnamePatch(
  raw: unknown,
): NormalizeOrgCustomDomainHostnameResult {
  const inner =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw
      ? (raw as { value: unknown }).value
      : raw;
  if (inner === null || inner === undefined) {
    return { ok: true, valueJson: { value: '' } };
  }
  if (typeof inner !== 'string') {
    return { ok: false, error: 'invalid_value' };
  }
  const trimmed = inner.trim().toLowerCase();
  if (trimmed === '') {
    return { ok: true, valueJson: { value: '' } };
  }
  if (!isPlausibleHostname(trimmed)) {
    return { ok: false, error: 'invalid_value' };
  }
  return { ok: true, valueJson: { value: trimmed } };
}
