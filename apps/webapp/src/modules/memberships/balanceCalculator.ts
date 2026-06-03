import type { PackageItemBalance, PackageUsageRecord, PatientPackageItemRecord } from "./types";

export function computeItemBalances(
  items: PatientPackageItemRecord[],
  usages: PackageUsageRecord[],
): PackageItemBalance[] {
  return items.map((item) => {
    const forItem = usages.filter((u) => u.patientPackageItemId === item.id);
    let reserved = 0;
    let consumed = 0;
    let released = 0;
    let penalty = 0;
    let refunded = 0;
    for (const u of forItem) {
      const q = u.quantity;
      switch (u.usageKind) {
        case "reserve":
          reserved += q;
          break;
        case "consume":
          consumed += q;
          break;
        case "release":
          released += q;
          break;
        case "penalty":
          penalty += q;
          break;
        case "manual_adjust":
          consumed += q;
          break;
        case "refund":
          refunded += q;
          break;
        default:
          break;
      }
    }
    const debited = Math.max(0, consumed + penalty - refunded);
    const credited = released;
    const remaining = item.quantityInitial - debited + credited - reserved;
    const displayRemaining = item.quantityInitial - debited + credited;
    return {
      patientPackageItemId: item.id,
      serviceId: item.serviceId,
      quantityInitial: item.quantityInitial,
      reserved,
      consumed,
      released,
      penalty,
      refunded,
      remaining: Math.max(0, remaining),
      displayRemaining: Math.max(0, displayRemaining),
    };
  });
}

export function hasAvailableForService(
  balances: PackageItemBalance[],
  serviceId: string,
  quantity = 1,
): boolean {
  const row = balances.find((b) => b.serviceId === serviceId);
  return row != null && row.remaining >= quantity;
}

export function findItemForService(
  items: PatientPackageItemRecord[],
  balances: PackageItemBalance[],
  serviceId: string,
): { item: PatientPackageItemRecord; balance: PackageItemBalance } | null {
  for (const item of items) {
    if (item.serviceId !== serviceId) continue;
    const balance = balances.find((b) => b.patientPackageItemId === item.id);
    if (balance && balance.remaining >= 1) {
      return { item, balance };
    }
  }
  return null;
}
