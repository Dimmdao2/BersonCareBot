import type { PackageUsageKind, PackageUsageRecord } from "./types";

export type AppointmentPackageLinkage =
  | "reserved"
  | "consumed"
  | "penalty"
  | "released"
  | "refunded"
  | "none";

export function computeAppointmentPackageLinkage(usages: PackageUsageRecord[]): AppointmentPackageLinkage {
  let reserved = 0;
  let released = 0;
  let consumed = 0;
  let penalty = 0;
  let refunded = 0;
  for (const u of usages) {
    const q = u.quantity;
    switch (u.usageKind) {
      case "reserve":
        reserved += q;
        break;
      case "release":
        released += q;
        break;
      case "consume":
        consumed += q;
        break;
      case "penalty":
        penalty += q;
        break;
      case "refund":
        refunded += q;
        break;
      default:
        break;
    }
  }
  const netReserve = reserved > released;
  const netConsumed = consumed + penalty > refunded;
  if (netConsumed) {
    return penalty >= consumed && penalty > 0 ? "penalty" : "consumed";
  }
  if (netReserve) return "reserved";
  if (refunded > 0) return "refunded";
  if (released > 0) return "released";
  return "none";
}

export type PackageSessionMappingStatus = "ok" | "mapping_missing" | "not_applicable";

export function resolvePackageSessionMappingStatus(params: {
  serviceId: string | null;
  packageServiceIds: Set<string>;
}): PackageSessionMappingStatus {
  if (!params.serviceId) return "mapping_missing";
  if (params.packageServiceIds.has(params.serviceId)) return "ok";
  return "not_applicable";
}
