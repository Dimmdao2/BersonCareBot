import { z } from "zod";

const uuidSchema = z.string().uuid();

/**
 * Параметр `?region=` в каталогах врача — только `reference_items.code` (например `spine`).
 * UUID в query не используется и не резолвится в refId на сервере.
 */
export function parseDoctorCatalogRegionQueryParam(raw: string | undefined): {
  regionCode: string | undefined;
  invalidRegionQuery: boolean;
} {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return { regionCode: undefined, invalidRegionQuery: false };
  if (uuidSchema.safeParse(t).success) {
    return { regionCode: undefined, invalidRegionQuery: true };
  }
  return { regionCode: t, invalidRegionQuery: false };
}
