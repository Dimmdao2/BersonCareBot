import type { PatientPackageRecord } from "./types";

export function isPatientPackageWithinValidity(
  pkg: Pick<PatientPackageRecord, "status" | "validFrom" | "validUntil">,
  now: Date = new Date(),
): boolean {
  if (pkg.status !== "active") return false;
  const t = now.getTime();
  if (pkg.validFrom) {
    const from = new Date(pkg.validFrom).getTime();
    if (t < from) return false;
  }
  if (pkg.validUntil) {
    const until = new Date(pkg.validUntil).getTime();
    if (t > until) return false;
  }
  return true;
}

export function isPatientPackageExpired(
  pkg: Pick<PatientPackageRecord, "validUntil" | "status">,
  now: Date = new Date(),
): boolean {
  if (pkg.status === "expired" || pkg.status === "cancelled") return pkg.status === "expired";
  if (!pkg.validUntil) return false;
  return new Date(pkg.validUntil).getTime() < now.getTime();
}
