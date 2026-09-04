import { createHash } from 'node:crypto';
import type { PackageItemInput, PatientPackageRecord } from './types';
import type { StaffPackageSaleIntent } from './ports';

/**
 * What a staff sale attempt actually asks for.
 *
 * The caller's `saleIdempotencyKey` says «this is one attempt»; it does NOT say which sale that
 * attempt is. An independent audit of `b10a50e74` showed the difference is money: the doctor's
 * panel keeps one attempt key while the form is open and clears it only on success, so a key
 * retained from a failed attempt travelled into the next submission — a 12 000 ₽ manual sale came
 * back «Абонемент создан» for the 2 500 ₽ catalog package the earlier attempt had created, and the
 * cash ledger was written at 2 500 ₽. Neither the doctor nor the patient saw a divergence.
 *
 * So the key that reaches the unique index is the caller's key bound to the request it identifies.
 * A repeat of the same request converges on the same package, and a different request under a
 * retained key is a different sale — it gets its own package, not the earlier one's price.
 */
export type SaleAttemptRequest = {
  platformUserId: string;
  method: StaffPackageSaleIntent['method'] | 'offer';
} & (
  | {
      kind: 'manual';
      priceMinor: number;
      currency: string;
      validityDays: number | null;
      deductionMode: string;
      items: PackageItemInput[];
    }
  | { kind: 'catalog'; subscriptionPackageId: string }
);

/**
 * Everything the fingerprint covers is money-visible or structural: who is being sold to, how the
 * sale settles, and what is being sold at what price. Deliberately outside it:
 *
 * - `title` and `notes` — free text the doctor may fix mid-attempt without changing the sale;
 * - `soldAt` — the panel stamps «now» on every submission that leaves the date field empty, so
 *   including it would give every retry a new identity and defeat the key entirely.
 */
function fingerprintSource(request: SaleAttemptRequest): string {
  const common = [request.kind, request.platformUserId, request.method];
  if (request.kind === 'catalog') {
    return JSON.stringify([...common, request.subscriptionPackageId]);
  }
  const items = request.items
    .map((item: PackageItemInput) => [item.serviceId, item.quantity] as const)
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] < b[0] ? -1 : 1));
  return JSON.stringify([
    ...common,
    request.priceMinor,
    request.currency,
    request.validityDays,
    request.deductionMode,
    items,
  ]);
}

/**
 * The key actually persisted in `be_patient_packages.sale_idempotency_key`. The caller's key stays
 * readable in front so a row can still be traced back to the attempt that made it.
 */
export function saleAttemptKey(callerKey: string, request: SaleAttemptRequest): string {
  const fingerprint = createHash('sha256')
    .update(fingerprintSource(request))
    .digest('hex')
    .slice(0, 32);
  return `${callerKey}:${fingerprint}`;
}

/**
 * The wall behind the key: whatever a lookup returned, it is only this sale's package if it is
 * still the package this request asked for. Compares what the request states — the buyer, the
 * catalog template or the manual price — never a derived or editable field.
 */
export function saleAttemptMatchesPackage(
  request: SaleAttemptRequest,
  pkg: PatientPackageRecord,
): boolean {
  if (pkg.platformUserId !== request.platformUserId) return false;
  if (request.kind === 'catalog') {
    return pkg.subscriptionPackageId === request.subscriptionPackageId;
  }
  return (
    pkg.subscriptionPackageId === null &&
    pkg.priceMinor === request.priceMinor &&
    pkg.currency === request.currency
  );
}
