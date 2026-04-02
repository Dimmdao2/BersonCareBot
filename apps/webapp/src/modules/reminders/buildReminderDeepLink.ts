import { env } from "@/config/env";
import type { ReminderLinkedObjectType } from "./types";

const KNOWN: ReminderLinkedObjectType[] = ["lfk_complex", "content_section", "content_page", "custom"];

function narrowLinkedType(raw: string | null): ReminderLinkedObjectType | null {
  if (!raw) return null;
  return (KNOWN as readonly string[]).includes(raw) ? (raw as ReminderLinkedObjectType) : null;
}

/**
 * Patient deep links for integrator reminder payloads (STAGE_1_CONTRACTS S1.T07).
 * Uses APP_BASE_URL (infra bootstrap); DB public URL can be wired later without changing paths.
 */
export function buildReminderDeepLink(params: {
  linkedObjectType: ReminderLinkedObjectType | string | null;
  linkedObjectId: string | null;
}): string {
  const base = env.APP_BASE_URL.replace(/\/$/, "");
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
