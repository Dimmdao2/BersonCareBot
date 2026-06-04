import type { RubitimeMappingRow, RubitimeMappingStatusCode } from "./types";

export const RUBITIME_MAPPING_STATUS_LABELS: Record<RubitimeMappingStatusCode, string> = {
  unmapped: "Не настроено",
  ssa_missing: "Нет доступности",
  reverse_missing: "Нет обратной связи",
  branch_unmapped: "Филиал не сопоставлен",
  specialist_unmapped: "Специалист не сопоставлен",
  service_unmapped: "Услуга не сопоставлена",
  legacy_inactive: "Отключено в Rubitime",
  duration_mismatch: "Конфликт длительности",
  price_mismatch: "Конфликт цены",
  mapped_ok: "Связано",
};

export function mappingRowHasProblems(row: Pick<RubitimeMappingRow, "status" | "issues">): boolean {
  return row.status !== "mapped_ok" || row.issues.length > 0;
}

export function mappingRowStatusTone(
  row: Pick<RubitimeMappingRow, "status" | "issues">,
): "default" | "urgent" | "neutral" {
  if (row.status === "mapped_ok" && row.issues.length === 0) return "default";
  if (row.status === "legacy_inactive") return "neutral";
  return "urgent";
}

export function formatPriceMinorRub(minor: number): string {
  return `${(minor / 100).toLocaleString("ru-RU")} ₽`;
}

export function formatMappingIssueLines(row: RubitimeMappingRow): string[] {
  const lines: string[] = [];
  if (row.status !== "mapped_ok") {
    lines.push(RUBITIME_MAPPING_STATUS_LABELS[row.status]);
  }
  if (row.issues.includes("duration_mismatch")) {
    const d = row.issueDetails?.durationMismatch;
    lines.push(
      d
        ? `Конфликт длительности: в кабинете ${d.canonicalMinutes} мин, в Rubitime ${d.legacyMinutes} мин. Выровняйте в «Услуги» и в справочнике Rubitime.`
        : "Конфликт длительности: значения в кабинете и Rubitime не совпадают.",
    );
  }
  if (row.issues.includes("price_mismatch")) {
    const p = row.issueDetails?.priceMismatch;
    lines.push(
      p
        ? `Конфликт цены: в кабинете ${formatPriceMinorRub(p.canonicalPriceMinor)}, в Rubitime ${formatPriceMinorRub(p.legacyPriceMinor)}. Выровняйте в «Услуги» и в справочнике Rubitime.`
        : "Конфликт цены: значения в кабинете и Rubitime не совпадают.",
    );
  }
  return lines;
}

export function mappingRowBadgeLabel(row: RubitimeMappingRow): string {
  if (row.status === "mapped_ok" && row.issues.length > 0) return "Нужно исправить";
  return RUBITIME_MAPPING_STATUS_LABELS[row.status];
}

export function problemsSummaryBanner(problems: number): string | null {
  if (problems <= 0) return null;
  const n = problems;
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? "связь" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "связи" : "связей";
  return `${n} ${word} требуют исправления. Ниже указано, что именно не совпадает. «Настроить» не меняет цену и длительность — выровняйте их в «Услуги» и в справочнике Rubitime.`;
}
