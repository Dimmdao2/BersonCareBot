import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import type { ReminderIntent, ReminderLinkedObjectType } from "./types";

export type ReminderIntentSectionLookup = {
  getBySlug(slug: string): Promise<{ systemParentCode: string | null } | null>;
};

/** Sync check for deeplink fallback when DB lookup is unavailable. */
export function isWarmupsContentSectionLinkedId(linkedObjectId: string | null | undefined): boolean {
  const id = typeof linkedObjectId === "string" ? linkedObjectId.trim() : "";
  return id.length > 0 && id === DEFAULT_WARMUPS_SECTION_SLUG;
}

export async function resolveReminderIntentForLinkedObject(
  linkedObjectType: ReminderLinkedObjectType,
  linkedObjectId: string | null,
  lookup?: ReminderIntentSectionLookup,
): Promise<ReminderIntent> {
  if (linkedObjectType === "rehab_program") return "exercises";
  if (linkedObjectType === "content_section") {
    const id = linkedObjectId?.trim() ?? "";
    if (!id) return "generic";
    if (isWarmupsContentSectionLinkedId(id)) return "warmup";
    if (lookup) {
      const sec = await lookup.getBySlug(id);
      if (sec?.systemParentCode === "warmups") return "warmup";
    }
    return "generic";
  }
  return "generic";
}
