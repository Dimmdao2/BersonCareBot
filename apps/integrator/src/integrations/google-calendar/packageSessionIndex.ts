type PackageUsageRow = {
  id: string;
  usage_kind: string;
  occurred_at: string;
};

type PackageItemRow = {
  quantity_initial: number;
};

export function computePackageSessionIndex(input: {
  items: PackageItemRow[];
  usages: PackageUsageRow[];
  usageRefId: string | null;
  soldAt: string | null;
  createdAt: string;
}): { sessionIndex: number; totalSessions: number; soldAtLabel: string } | null {
  if (!input.usageRefId) return null;
  const totalSessions = input.items.reduce((sum, it) => sum + it.quantity_initial, 0);
  if (totalSessions <= 0) return null;
  const linkedKinds = new Set(['reserve', 'consume', 'manual_adjust']);
  const ordered = [...input.usages]
    .filter((u) => linkedKinds.has(u.usage_kind))
    .sort((a, b) => {
      const t = a.occurred_at.localeCompare(b.occurred_at);
      if (t !== 0) return t;
      return a.id.localeCompare(b.id);
    });
  const idx = ordered.findIndex((u) => u.id === input.usageRefId);
  if (idx < 0) return null;
  const soldAtIso = input.soldAt ?? input.createdAt;
  return {
    sessionIndex: idx + 1,
    totalSessions,
    soldAtLabel: soldAtIso.slice(0, 10),
  };
}

export function formatPackageSessionDescriptionLine(index: {
  sessionIndex: number;
  totalSessions: number;
  soldAtLabel: string;
}): string {
  return `Абонемент от ${index.soldAtLabel}: сеанс ${index.sessionIndex} из ${index.totalSessions}`;
}
