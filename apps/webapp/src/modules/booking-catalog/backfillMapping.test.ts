/**
 * Unit tests for backfill-patient-bookings-v2 mapping logic.
 * Validates the LEGACY_MAP resolution without hitting the DB.
 */
import { describe, expect, it } from "vitest";

// Mirrors LEGACY_MAP from the backfill script
const LEGACY_MAP: Record<string, { rubitime_branch_id: string; service_duration: number }> = {
  "moscow:rehab_lfk": { rubitime_branch_id: "17356", service_duration: 60 },
  "spb:rehab_lfk":    { rubitime_branch_id: "18265", service_duration: 60 },
};

type MockCatalogEntry = {
  branch_service_id: string;
  city_code: string;
  duration_minutes: number;
  branch_title: string;
  service_title: string;
};

const MOCK_CATALOG: MockCatalogEntry[] = [
  { branch_service_id: "bbs-moscow-60", city_code: "moscow", duration_minutes: 60, branch_title: "Москва. Точка Здоровья", service_title: "Сеанс 60 мин" },
  { branch_service_id: "bbs-moscow-40", city_code: "moscow", duration_minutes: 40, branch_title: "Москва. Точка Здоровья", service_title: "Сеанс 40 мин" },
  { branch_service_id: "bbs-moscow-90", city_code: "moscow", duration_minutes: 90, branch_title: "Москва. Точка Здоровья", service_title: "Сеанс 90 мин" },
  { branch_service_id: "bbs-spb-60",    city_code: "spb",    duration_minutes: 60, branch_title: "Санкт-Петербург", service_title: "Сеанс 60 мин" },
  { branch_service_id: "bbs-spb-90",    city_code: "spb",    duration_minutes: 90, branch_title: "Санкт-Петербург", service_title: "Сеанс 90 мин" },
];

function buildCatalogIndex(entries: MockCatalogEntry[]): Map<string, MockCatalogEntry> {
  const index = new Map<string, MockCatalogEntry>();
  for (const e of entries) {
    index.set(`${e.city_code}:${e.duration_minutes}`, e);
  }
  return index;
}

function resolveRow(
  city: string | null,
  category: string | null,
  catalogIndex: Map<string, MockCatalogEntry>,
): { matched: true; entry: MockCatalogEntry } | { matched: false; reason: string } {
  const cityKey = (city ?? "").toLowerCase().trim();
  const catKey = (category ?? "").toLowerCase().trim();
  const legacyKey = `${cityKey}:${catKey}`;

  const mapEntry = LEGACY_MAP[legacyKey];
  if (!mapEntry) {
    return { matched: false, reason: `no mapping for "${legacyKey}"` };
  }

  const catalogKey = `${cityKey}:${mapEntry.service_duration}`;
  const catalogEntry = catalogIndex.get(catalogKey);
  if (!catalogEntry) {
    return { matched: false, reason: `catalog entry not found for "${catalogKey}"` };
  }

  return { matched: true, entry: catalogEntry };
}

describe("backfill legacy mapping", () => {
  const index = buildCatalogIndex(MOCK_CATALOG);

  it("resolves moscow:rehab_lfk → moscow 60min", () => {
    const result = resolveRow("moscow", "rehab_lfk", index);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.entry.branch_service_id).toBe("bbs-moscow-60");
      expect(result.entry.service_title).toBe("Сеанс 60 мин");
    }
  });

  it("resolves spb:rehab_lfk → spb 60min", () => {
    const result = resolveRow("spb", "rehab_lfk", index);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.entry.branch_service_id).toBe("bbs-spb-60");
    }
  });

  it("skips unknown city:category combination", () => {
    const result = resolveRow("novosibirsk", "rehab_lfk", index);
    expect(result.matched).toBe(false);
  });

  it("skips known city with unknown category", () => {
    const result = resolveRow("moscow", "nutrition", index);
    expect(result.matched).toBe(false);
  });

  it("skips null city", () => {
    const result = resolveRow(null, "rehab_lfk", index);
    expect(result.matched).toBe(false);
  });

  it("dry-run: same row produces same result on multiple calls (idempotency)", () => {
    const r1 = resolveRow("moscow", "rehab_lfk", index);
    const r2 = resolveRow("moscow", "rehab_lfk", index);
    expect(r1).toEqual(r2);
  });

  it("conflict case: catalog empty → all rows skip gracefully", () => {
    const emptyIndex = new Map<string, MockCatalogEntry>();
    const result = resolveRow("moscow", "rehab_lfk", emptyIndex);
    expect(result.matched).toBe(false);
    if (!result.matched) {
      expect(result.reason).toContain("catalog entry not found");
    }
  });
});
