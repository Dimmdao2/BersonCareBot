import type { ReferenceItem } from "@/modules/references/types";
import {
  DOCTOR_CATALOG_FILTER_MISSING,
  type DoctorCatalogMissingFilter,
  isDoctorCatalogMissingFilterToken,
} from "@/shared/lib/doctorCatalogEmptyFieldFilter";
import type { ExerciseLoadType } from "./types";

const LOAD_TYPE_CODE_TOKEN = /^[a-z0-9_]+$/;

/**
 * Тип нагрузки упражнения — код в `lfk_exercises.load_type` сверяется со справочником
 * `reference_categories` / `reference_items` (`load_type`).
 *
 * **Синхронизация набора кодов v1 при любом изменении списка (согласованность в одном PR):**
 * 1. SQL: `0041_exercise_load_type_reference_align.sql` + `0069_lfk_exercises_load_type_catalog.sql` (INSERT … ON CONFLICT DO NOTHING)
 * 2. Константа `EXERCISE_LOAD_TYPE_SEED_V1` (фоллбек allowlist/UI при пустой БД)
 * 3. `apps/webapp/src/infra/repos/inMemoryReferences.ts` — строки категории `load_type`
 *
 * Ограничение: в `lfk_exercises` **нет** фиксированного CHECK по `load_type` — коды задаются справочником.
 *
 * Регрессия: `src/modules/lfk-exercises/exerciseLoadTypeSeedParity.test.ts`.
 */
export const EXERCISE_LOAD_TYPE_CATEGORY_CODE = "load_type" as const;

export const EXERCISE_LOAD_TYPE_SEED_V1 = [
  { code: "strength" as const, title: "Силовая", sortOrder: 1 },
  { code: "stretch" as const, title: "Растяжка", sortOrder: 2 },
  { code: "balance" as const, title: "Баланс", sortOrder: 3 },
  { code: "cardio" as const, title: "Кардио", sortOrder: 4 },
  { code: "other" as const, title: "Другое", sortOrder: 5 },
  { code: "static_hold" as const, title: "Статическое укрепление / удержание", sortOrder: 6 },
] as const;

function seedCodesSet(): Set<string> {
  return new Set(EXERCISE_LOAD_TYPE_SEED_V1.map((x) => x.code));
}

/** Коды в порядке сида (для preserve-query и тестов без async). */
export const EXERCISE_LOAD_TYPE_SEED_CODES_ORDERED: readonly ExerciseLoadType[] =
  EXERCISE_LOAD_TYPE_SEED_V1.map((x) => x.code);

/**
 * Коды, разрешённые при записи и строгой проверке query-параметра `load`.
 * Если в БД есть активные строки — только они; иначе фоллбек на сид v1.
 */
export function exerciseLoadTypeWriteAllowSet(items: ReferenceItem[]): Set<string> {
  const fromDb = new Set(
    items.filter((i) => i.isActive && i.deletedAt == null).map((i) => i.code.trim()).filter(Boolean),
  );
  if (fromDb.size > 0) return fromDb;
  return seedCodesSet();
}

export function parseExerciseLoadQueryParam(
  raw: string | undefined,
  allowSet: Set<string>,
): ExerciseLoadType | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t || !allowSet.has(t)) return undefined;
  return t as ExerciseLoadType;
}

/** Query `load=` каталога: код из справочника или {@link DOCTOR_CATALOG_FILTER_MISSING}. */
export function parseExerciseLoadFilterQueryParam(
  raw: string | undefined,
  allowSet: Set<string>,
): ExerciseLoadType | DoctorCatalogMissingFilter | undefined {
  if (isDoctorCatalogMissingFilterToken(typeof raw === "string" ? raw : undefined)) {
    return DOCTOR_CATALOG_FILTER_MISSING;
  }
  return parseExerciseLoadQueryParam(raw, allowSet);
}

/**
 * Клиентский `?load=` (и SSR hint): формат кода как у `region`, без allowlist —
 * список в UI приходит из справочника, а жёсткая проверка allowSet на клиенте ломала фильтр
 * для кодов, добавленных в БД после сида.
 */
export function parseExerciseLoadCatalogUrlParam(
  raw: string | null | undefined,
): ExerciseLoadType | DoctorCatalogMissingFilter | undefined {
  if (raw == null) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  if (isDoctorCatalogMissingFilterToken(t)) return DOCTOR_CATALOG_FILTER_MISSING;
  const lower = t.toLowerCase();
  if (!LOAD_TYPE_CODE_TOKEN.test(lower)) return undefined;
  return lower as ExerciseLoadType;
}

export function parseExerciseLoadFormValue(
  raw: FormDataEntryValue | null,
  allowSet: Set<string>,
): ExerciseLoadType | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  if (!allowSet.has(t)) return null;
  return t as ExerciseLoadType;
}
