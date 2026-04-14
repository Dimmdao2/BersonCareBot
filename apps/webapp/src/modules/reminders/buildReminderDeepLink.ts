import { getAppBaseUrlSync } from "@/modules/system-settings/integrationRuntime";
import type { ReminderLinkedObjectType } from "./types";

const KNOWN: ReminderLinkedObjectType[] = ["lfk_complex", "content_section", "content_page", "custom"];

function narrowLinkedType(raw: string | null): ReminderLinkedObjectType | null {
  if (!raw) return null;
  return (KNOWN as readonly string[]).includes(raw) ? (raw as ReminderLinkedObjectType) : null;
}

/**
 * Patient deep links for integrator reminder payloads (STAGE_1_CONTRACTS S1.T07).
 * Base URL: admin `app_base_url` or env `APP_BASE_URL`.
 */
export function buildReminderDeepLink(params: {
  linkedObjectType: ReminderLinkedObjectType | string | null;
  linkedObjectId: string | null;
}): string {
  const base = getAppBaseUrlSync().replace(/\/$/, "");
  const linkedObjectType = narrowLinkedType(
    typeof params.linkedObjectType === "string" ? params.linkedObjectType : null,
  );
  const { linkedObjectId } = params;
  if (!linkedObjectType || !linkedObjectId?.trim()) {
    return `${base}/app/patient/reminders?from=reminder`;
  }
  const id = encodeURIComponent(linkedObjectId.trim());
  switch (linkedObjectType) {
    case "lfk_complex":
      return `${base}/app/patient/diary/lfk/journal?complexId=${id}&from=reminder`;
    case "content_section":
      return `${base}/app/patient/sections/${id}?from=reminder`;
    case "content_page":
      return `${base}/app/patient/content/${id}?from=reminder`;
    case "custom":
    default:
      return `${base}/app/patient/reminders?from=reminder`;
  }
}
