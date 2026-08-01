/**
 * §5a item 2.11 — the ladder has exactly two subjects: the cabinet (`systemAccessPolicy`) and each
 * mechanic (`mechanicAccessPolicies`), per {@link CabinetAccessResolution} / {@link
 * MechanicAccessResolution} in `types.ts`. `admin_audit_log` already stores the full before/after
 * tariff row on every `saas_tariff_*` write (`pgPlatformEntitlements.ts` `appendAudit`) — this module
 * only picks the two ladder fields out of that row and reports which of them actually changed, so the
 * journal shows "что было → что стало" per subject instead of a raw tariff diff.
 */
import { MECHANIC_REGISTRY, type AccessLifecyclePolicy, type OrgMechanic } from './types';

export type TariffPolicyDiffEntry = {
  /** `null` marks the cabinet subject; otherwise the mechanic the policy belongs to. */
  mechanic: OrgMechanic | null;
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

type PolicySnapshot = {
  systemAccessPolicy: AccessLifecyclePolicy | null;
  mechanicAccessPolicies: Record<string, AccessLifecyclePolicy>;
};

function extractPolicySnapshot(raw: unknown): PolicySnapshot {
  if (!raw || typeof raw !== 'object') {
    return { systemAccessPolicy: null, mechanicAccessPolicies: {} };
  }
  const rec = raw as Record<string, unknown>;
  const systemAccessPolicy = isAccessLifecyclePolicy(rec.systemAccessPolicy)
    ? rec.systemAccessPolicy
    : null;
  const mechanicAccessPolicies: Record<string, AccessLifecyclePolicy> = {};
  const rawMap = rec.mechanicAccessPolicies;
  if (rawMap && typeof rawMap === 'object') {
    for (const [key, value] of Object.entries(rawMap as Record<string, unknown>)) {
      if (isAccessLifecyclePolicy(value)) mechanicAccessPolicies[key] = value;
    }
  }
  return { systemAccessPolicy, mechanicAccessPolicies };
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

function mechanicLabel(mechanic: string): string {
  const definition = (MECHANIC_REGISTRY as Record<string, { label: string }>)[mechanic];
  return definition?.label ?? mechanic;
}

/**
 * `before`/`after` are the raw `saas_tariffs` row snapshots stored in an `admin_audit_log.details`
 * entry (or `null` for `before` on `saas_tariff_create`). Returns one entry per ladder subject that
 * actually changed — an untouched cabinet or mechanic policy produces no entry.
 */
export function diffTariffPolicySnapshots(before: unknown, after: unknown): TariffPolicyDiffEntry[] {
  const b = extractPolicySnapshot(before);
  const a = extractPolicySnapshot(after);
  const entries: TariffPolicyDiffEntry[] = [];

  if (!policyEqual(b.systemAccessPolicy, a.systemAccessPolicy)) {
    entries.push({
      mechanic: null,
      label: 'Кабинет',
      before: b.systemAccessPolicy,
      after: a.systemAccessPolicy,
    });
  }

  const mechanics = new Set([
    ...Object.keys(b.mechanicAccessPolicies),
    ...Object.keys(a.mechanicAccessPolicies),
  ]);
  for (const mechanic of [...mechanics].sort()) {
    const beforePolicy = b.mechanicAccessPolicies[mechanic] ?? null;
    const afterPolicy = a.mechanicAccessPolicies[mechanic] ?? null;
    if (!policyEqual(beforePolicy, afterPolicy)) {
      entries.push({
        mechanic: mechanic as OrgMechanic,
        label: mechanicLabel(mechanic),
        before: beforePolicy,
        after: afterPolicy,
      });
    }
  }

  return entries;
}
