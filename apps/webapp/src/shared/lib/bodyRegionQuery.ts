import { z } from "zod";
import type { ReferenceItem } from "@/modules/references/types";

const BODY_REGION_CATEGORY_CODE = "body_region";
const uuidSchema = z.string().uuid();

type ReferencesReader = {
  listActiveItemsByCategoryCode: (categoryCode: string) => Promise<ReferenceItem[]>;
};

export async function resolveBodyRegionRefIdFromQuery(
  regionQueryRaw: string | undefined,
  references: ReferencesReader,
): Promise<{ regionRefId: string | undefined; invalidQuery: boolean }> {
  const regionQuery = typeof regionQueryRaw === "string" ? regionQueryRaw.trim() : "";
  if (!regionQuery) return { regionRefId: undefined, invalidQuery: false };

  if (uuidSchema.safeParse(regionQuery).success) {
    return { regionRefId: regionQuery, invalidQuery: false };
  }

  const regionItems = await references.listActiveItemsByCategoryCode(BODY_REGION_CATEGORY_CODE);
  const byCode = regionItems.find((i) => i.code === regionQuery);
  if (byCode) {
    return { regionRefId: byCode.id, invalidQuery: false };
  }

  return { regionRefId: undefined, invalidQuery: true };
}
