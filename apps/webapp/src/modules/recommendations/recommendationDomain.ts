import type { ReferenceItemDto } from "@/modules/references/referenceCache";
import type { ReferenceItem } from "@/modules/references/types";

/**
 * D3 (Q3): типы рекомендаций — код в `recommendations.domain` сверяется со справочником
 * `reference_categories` / `reference_items` (`recommendation_type`).
 *
 * **Синхронизация набора кодов v1 при любом изменении списка (три точки в одном PR):**
 * 1. SQL: `apps/webapp/db/drizzle-migrations/0039_recommendation_type_reference.sql`
 * 2. Константа `RECOMMENDATION_TYPE_SEED_V1` ниже (фоллбек allowlist/UI при пустой БД)
 * 3. `apps/webapp/src/infra/repos/inMemoryReferences.ts` — категория и строки `recommendation_type`
 *
 * Регрессия: `src/modules/recommendations/recommendationTypeSeedParity.test.ts`.
 */
export const RECOMMENDATION_TYPE_CATEGORY_CODE = "recommendation_type" as const;

/** Код типа в БД / query `domain=`; может быть legacy-строкой на чтении (read tolerant). */
export type RecommendationDomain = string;

/**
 * Канон v1 для сидов миграции и фоллбека, если в БД ещё нет активных строк
 * (например миграция не применена в локальном окружении).
 */
export const RECOMMENDATION_TYPE_SEED_V1 = [
  { code: "exercise_technique", title: "Техника упражнений", sortOrder: 1 },
  { code: "regimen", title: "Режим / график", sortOrder: 2 },
  { code: "nutrition", title: "Питание", sortOrder: 3 },
  { code: "device", title: "Устройство / аппарат", sortOrder: 4 },
  { code: "self_procedure", title: "Самостоятельная процедура", sortOrder: 5 },
  { code: "external_therapy", title: "Внешняя терапия", sortOrder: 6 },
  { code: "lifestyle", title: "Образ жизни", sortOrder: 7 },
  { code: "daily_activity", title: "Бытовая активность", sortOrder: 8 },
  { code: "physiotherapy", title: "Физиотерапия", sortOrder: 9 },
  { code: "motivation", title: "Мотивация", sortOrder: 10 },
  { code: "safety", title: "Техника безопасности", sortOrder: 11 },
] as const;

function seedCodesSet(): Set<string> {
  return new Set(RECOMMENDATION_TYPE_SEED_V1.map((x) => x.code));
}

/**
 * Коды, разрешённые при записи и строгой проверке query-параметра `domain`.
 * Если в БД есть активные строки — только они; иначе фоллбек на сид v1.
 */
export function recommendationDomainWriteAllowSet(items: ReferenceItem[]): Set<string> {
  const fromDb = new Set(
    items.filter((i) => i.isActive && i.deletedAt == null).map((i) => i.code.trim()).filter(Boolean),
  );
  if (fromDb.size > 0) return fromDb;
  return seedCodesSet();
}

export function referenceItemsToRecommendationDomainFilterDto(items: ReferenceItem[]): ReferenceItemDto[] {
  return [...items]
    .filter((i) => i.isActive && i.deletedAt == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .map((i) => ({ id: i.id, code: i.code, title: i.title, sortOrder: i.sortOrder }));
}

/** Подпись для UI: из справочника, сида или сырой код (read tolerant). */
export function recommendationDomainDisplayTitle(
  code: string | null | undefined,
  items: ReferenceItem[],
): string {
  const t = (code ?? "").trim();
  if (!t) return "";
  const hit = items.find((i) => i.code === t && i.isActive && i.deletedAt == null);
  if (hit) return hit.title;
  const seed = RECOMMENDATION_TYPE_SEED_V1.find((x) => x.code === t);
  return seed?.title ?? t;
}

/**
 * Опции `<select>` «Тип»: активные строки справочника; при неизвестном сохранённом коде —
 * дополнительная опция (read tolerant); при пустом справочнике — сид v1.
 */
export function buildRecommendationDomainSelectOptions(
  items: ReferenceItem[],
  currentDomain: string | null | undefined,
): Array<{ code: string; title: string }> {
  const active = [...items].filter((i) => i.isActive && i.deletedAt == null);
  const base =
    active.length > 0
      ? active.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)).map((i) => ({
          code: i.code,
          title: i.title,
        }))
      : RECOMMENDATION_TYPE_SEED_V1.map((x) => ({ code: x.code, title: x.title }));
  const cur = (currentDomain ?? "").trim();
  if (cur && !base.some((o) => o.code === cur)) {
    return [{ code: cur, title: `${cur} (не в справочнике)` }, ...base];
  }
  return base;
}

/**
 * Строгая проверка query/body: код допустим, если входит в {@link recommendationDomainWriteAllowSet}.
 */
export function parseRecommendationDomain(
  raw: string | undefined,
  refItems: ReferenceItem[],
): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const t = raw.trim();
  const allow = recommendationDomainWriteAllowSet(refItems);
  return allow.has(t) ? t : undefined;
}

/** Без справочника: только сиды (редкие unit-тесты). */
export function recommendationDomainTitle(code: string | null | undefined): string {
  return recommendationDomainDisplayTitle(code, []);
}
