import type { ReferenceItemDto } from "@/modules/references/referenceCache";
import type { ReferenceItem } from "@/modules/references/types";

/** Категория `reference_categories.code` для видов оценки клинических тестов (D2 / Q1). */
export const CLINICAL_ASSESSMENT_KIND_CATEGORY_CODE = "clinical_assessment_kind" as const;

/**
 * Канон v1 для сидов миграции и фоллбека, если в БД ещё нет активных строк
 * (например миграция не применена в локальном окружении).
 */
export const CLINICAL_ASSESSMENT_KIND_SEED_V1 = [
  { code: "mobility", title: "Подвижность" },
  { code: "pain", title: "Болезненность" },
  { code: "sensitivity", title: "Чувствительность" },
  { code: "strength", title: "Сила" },
  { code: "neurodynamics", title: "Нейродинамика" },
  { code: "proprioception", title: "Проприоцепция" },
  { code: "balance", title: "Равновесие" },
  { code: "endurance", title: "Выносливость" },
] as const;

function seedCodesSet(): Set<string> {
  return new Set(CLINICAL_ASSESSMENT_KIND_SEED_V1.map((x) => x.code));
}

/**
 * Коды, разрешённые при записи и строгой проверке query-параметра `assessment`.
 * Если в БД есть активные строки — только они; иначе фоллбек на сид v1.
 */
export function assessmentKindWriteAllowSet(items: ReferenceItem[]): Set<string> {
  const fromDb = new Set(
    items.filter((i) => i.isActive && i.deletedAt == null).map((i) => i.code.trim()).filter(Boolean),
  );
  if (fromDb.size > 0) return fromDb;
  return seedCodesSet();
}

export function referenceItemsToAssessmentKindFilterDto(items: ReferenceItem[]): ReferenceItemDto[] {
  return [...items]
    .filter((i) => i.isActive && i.deletedAt == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .map((i) => ({ id: i.id, code: i.code, title: i.title, sortOrder: i.sortOrder }));
}

/** Подпись для UI: из справочника или сырой код (read tolerant). */
export function assessmentKindDisplayTitle(
  code: string | null | undefined,
  items: ReferenceItem[],
): string {
  const t = (code ?? "").trim();
  if (!t) return "";
  const hit = items.find((i) => i.code === t && i.isActive && i.deletedAt == null);
  if (hit) return hit.title;
  const seed = CLINICAL_ASSESSMENT_KIND_SEED_V1.find((x) => x.code === t);
  return seed?.title ?? t;
}

/**
 * Опции `<select>` «Вид оценки»: активные строки справочника; при неизвестном сохранённом коде —
 * дополнительная опция (read tolerant); при пустом справочнике — сид v1.
 */
export function buildClinicalAssessmentKindSelectOptions(
  items: ReferenceItem[],
  currentAssessmentKind: string | null | undefined,
): Array<{ code: string; title: string }> {
  const active = [...items].filter((i) => i.isActive && i.deletedAt == null);
  const base =
    active.length > 0
      ? active.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)).map((i) => ({
          code: i.code,
          title: i.title,
        }))
      : CLINICAL_ASSESSMENT_KIND_SEED_V1.map((x) => ({ code: x.code, title: x.title }));
  const cur = (currentAssessmentKind ?? "").trim();
  if (cur && !base.some((o) => o.code === cur)) {
    return [{ code: cur, title: `${cur} (не в справочнике)` }, ...base];
  }
  return base;
}
