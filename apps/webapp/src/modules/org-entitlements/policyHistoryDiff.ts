/**
 * §5a item 2.11 — the ladder has one subject in product: the cabinet (`systemAccessPolicy`).
 * Per-mechanic ladder exceptions were removed (#1069 T1, owner 05.08). `admin_audit_log` stores
 * the full before/after tariff row on every `saas_tariff_*` write; this module reports system-policy
 * changes only.
 */
import type { AccessLifecyclePolicy } from './types';

export type TariffPolicyDiffEntry = {
  /** `null` marks the cabinet subject. */
  mechanic: null;
  label: string;
  before: AccessLifecyclePolicy | null;
  after: AccessLifecyclePolicy | null;
};

function isAccessLifecyclePolicy(value: unknown): value is AccessLifecyclePolicy {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.graceDays === 'number' &&
    typeof rec.readOnlyDays === 'number' &&
    Array.isArray(rec.notifications) &&
    (rec.terminalState === 'read_only' || rec.terminalState === 'disabled')
  );
}

/** Recursively key-sorted JSON — object key order is not meaningful, array order (notifications) is. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function policyEqual(a: AccessLifecyclePolicy | null, b: AccessLifecyclePolicy | null): boolean {
  return stableStringify(a) === stableStringify(b);
}

function extractSystemAccessPolicy(raw: unknown): AccessLifecyclePolicy | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  return isAccessLifecyclePolicy(rec.systemAccessPolicy) ? rec.systemAccessPolicy : null;
}

/**
 * `before`/`after` are the raw `saas_tariffs` row snapshots stored in an `admin_audit_log.details`
 * entry (or `null` for `before` on `saas_tariff_create`). Returns an entry only when the system
 * access policy actually changed.
 */
export function diffTariffPolicySnapshots(before: unknown, after: unknown): TariffPolicyDiffEntry[] {
  const beforePolicy = extractSystemAccessPolicy(before);
  const afterPolicy = extractSystemAccessPolicy(after);
  if (policyEqual(beforePolicy, afterPolicy)) return [];
  return [
    {
      mechanic: null,
      label: 'Кабинет',
      before: beforePolicy,
      after: afterPolicy,
    },
  ];
}
