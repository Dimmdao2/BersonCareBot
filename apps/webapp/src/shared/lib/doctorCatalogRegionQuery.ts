import { z } from "zod";
import type { ReferenceItem } from "@/modules/references/types";

const uuidSchema = z.string().uuid();

/** Код `reference_items.code` для `body_region`: строчные латинские буквы, цифры, подчёркивание (без пробелов/дефисов). */
const BODY_REGION_CODE_TOKEN = /^[a-z0-9_]+$/;

/**
 * Параметр `?region=` в каталогах врача — только `reference_items.code` (например `spine`).
 * Пустое, UUID, несоответствие формату кода — без отдельного UX-флага: `regionCode` просто `undefined` («Все регионы»).
 */
export function parseDoctorCatalogRegionQueryParam(raw: string | undefined): {
  regionCode: string | undefined;
} {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return { regionCode: undefined };
  if (uuidSchema.safeParse(t).success) return { regionCode: undefined };
  const lower = t.toLowerCase();
  if (!BODY_REGION_CODE_TOKEN.test(lower)) return { regionCode: undefined };
  return { regionCode: lower };
}

/**
 * Код региона из `?region=` (после {@link parseDoctorCatalogRegionQueryParam}) → `reference_items.id`
 * для серверного `list*({ regionRefId })`. Без совпадения в переданном списке активных `body_region` — `null` (как без фильтра на сервере).
 */
export function resolveBodyRegionRefIdFromCatalogCode(
  bodyRegionItems: readonly ReferenceItem[],
  regionCode: string | undefined,
): string | null {
  const t = regionCode?.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const it = bodyRegionItems.find((x) => x.code.toLowerCase() === lower);
  return it?.id ?? null;
}
