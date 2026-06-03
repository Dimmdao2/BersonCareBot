import type { PackageUsageRecord, PatientPackageItemRecord } from "./types";

export type PackageSessionIndex = {
  sessionIndex: number;
  totalSessions: number;
  soldAtLabel: string;
};

export function computePackageSessionIndex(input: {
  items: PatientPackageItemRecord[];
  usages: PackageUsageRecord[];
  usageRefId: string | null;
  soldAt: string | null;
  createdAt: string;
}): PackageSessionIndex | null {
  if (!input.usageRefId) return null;
  const totalSessions = input.items.reduce((sum, it) => sum + it.quantityInitial, 0);
  if (totalSessions <= 0) return null;

  const linkedKinds = new Set(["reserve", "consume", "manual_adjust"]);
  const ordered = [...input.usages]
    .filter((u) => linkedKinds.has(u.usageKind))
    .sort((a, b) => {
      const t = a.occurredAt.localeCompare(b.occurredAt);
      if (t !== 0) return t;
      return a.id.localeCompare(b.id);
    });

  const idx = ordered.findIndex((u) => u.id === input.usageRefId);
  if (idx < 0) return null;

  const soldAtIso = input.soldAt ?? input.createdAt;
  const soldAtLabel = soldAtIso.slice(0, 10);

  return {
    sessionIndex: idx + 1,
    totalSessions,
    soldAtLabel,
  };
}

export function formatPackageSessionDescriptionLine(index: PackageSessionIndex): string {
  return `Абонемент от ${index.soldAtLabel}: сеанс ${index.sessionIndex} из ${index.totalSessions}`;
}
