import type { WebappSqlExecutor } from '@/infra/db/runWebappSql';
import { runWebappPgText } from '@/infra/db/runWebappSql';

/**
 * `запас`-class mechanics (§5a stage 5): a plain count against a tariff-configured ceiling, no
 * period, freed only by an explicit release (archive/deactivate) elsewhere in the domain. Also
 * reused for the `объём` (byte-sum) mechanic `files`: same quota-json shape and lock-then-recount
 * shape, but usage is a live SUM that a row delete already shrinks, and each call can add more
 * than one unit at once (see `increment` on `assertStockQuotaAvailable`).
 */
export type StockMechanic = 'patient_count' | 'branches' | 'files';

export class StockQuotaReachedError extends Error {
  readonly mechanic: StockMechanic;
  constructor(mechanic: StockMechanic) {
    super(`saas_quota_reached:${mechanic}`);
    this.mechanic = mechanic;
  }
}

type StockQuotaJson = { kind: 'numeric' | 'unlimited'; limit: number | null };

export function parseStockQuota(value: unknown): StockQuotaJson | null {
  if (!value || typeof value !== 'object') return null;
  const quota = value as Record<string, unknown>;
  if (quota.kind !== 'numeric' && quota.kind !== 'unlimited') return null;
  return { kind: quota.kind, limit: typeof quota.limit === 'number' ? quota.limit : null };
}

/**
 * Atomic, race-safe `запас` capacity check. Advisory-locks the organization+mechanic pair, then
 * resolves the effective quota (override > tariff) with a single-transaction SQL recount — mirrors
 * `pgOrganizationInvites.createReplacingPending`'s seat-capacity check verbatim (same
 * `runWebappPgText`/`$1..$n` transport, this repository's canonical atomic-quota example: an
 * application-transaction snapshot, not a DB trigger). The caller's own `countUsage` runs AFTER
 * the lock, so its count reflects the serialized view.
 *
 * No tariff assigned -> compatibility, unlimited (matches `fileStorageLimitFromSnapshot`). A
 * tariff assigned but missing this mechanic's quota key refuses further growth rather than
 * silently falling back to unlimited.
 *
 * §2.12 — the tariff row this reads is `app.saas_billing_effective_tariff(organizationId,
 * tariff_id)`, the same frozen/live switch every other reader of tariff content goes through: a
 * live paid period holds the quota LIMIT to what was configured at payment time, not a live edit.
 *
 * `increment` is how many units THIS call is about to add on top of `countUsage()` (default 1,
 * matching every count-based `запас` caller). `объём` callers pass the byte size of the file
 * being uploaded; `used + increment > limit` reduces to the plain `used >= limit` count check
 * when `increment` is 1, so existing callers are unaffected.
 */
export async function assertStockQuotaAvailable(
  tx: WebappSqlExecutor,
  organizationId: string,
  mechanic: StockMechanic,
  countUsage: () => Promise<number>,
  increment = 1,
): Promise<void> {
  await runWebappPgText(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`saas_quota:${mechanic}:${organizationId}`],
    tx,
  );

  const capacity = await runWebappPgText<{ tariff_id: string | null; quota_json: unknown }>(
    `SELECT
       o.tariff_id AS tariff_id,
       COALESCE(
         (SELECT eo.quota FROM saas_org_entitlement_overrides eo
          WHERE eo.organization_id = $1 AND eo.mechanic = $2
            AND (eo.expires_at IS NULL OR eo.expires_at > now())),
         (SELECT t.quotas -> $2
          FROM app.saas_billing_effective_tariff($1::uuid, o.tariff_id) t)
       ) AS quota_json
     FROM be_organizations o
     WHERE o.id = $1`,
    [organizationId, mechanic],
    tx,
  );
  const row = capacity.rows[0];
  if (!row?.tariff_id) return;

  const quota = parseStockQuota(row.quota_json);
  if (!quota) throw new StockQuotaReachedError(mechanic);
  if (quota.kind === 'unlimited') return;
  if (quota.limit === null) throw new StockQuotaReachedError(mechanic);

  const used = await countUsage();
  if (used + increment > quota.limit) throw new StockQuotaReachedError(mechanic);
}
