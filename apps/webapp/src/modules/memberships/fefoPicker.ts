import type { PatientPackageListItem } from "./types";

function parseTime(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/** FEFO: nearest validUntil, then packages without deadline, then createdAt, then id. */
export function pickPatientPackageFefo(
  packages: PatientPackageListItem[],
  serviceId: string,
): PatientPackageListItem | null {
  const eligible = packages.filter((pkg) =>
    pkg.balance.items.some((b) => b.serviceId === serviceId && b.remaining >= 1),
  );
  if (eligible.length === 0) return null;

  const withDeadline = eligible.filter((p) => p.validUntil != null);
  const withoutDeadline = eligible.filter((p) => p.validUntil == null);

  const sortGroup = (list: PatientPackageListItem[]) =>
    [...list].sort((a, b) => {
      const untilDiff = parseTime(a.validUntil) - parseTime(b.validUntil);
      if (untilDiff !== 0) return untilDiff;
      const createdDiff = parseTime(a.createdAt) - parseTime(b.createdAt);
      if (createdDiff !== 0) return createdDiff;
      return a.id.localeCompare(b.id);
    });

  const ordered = [...sortGroup(withDeadline), ...sortGroup(withoutDeadline)];
  return ordered[0] ?? null;
}
