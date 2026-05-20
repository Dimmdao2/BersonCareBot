import { routePaths } from "@/app-layer/routes/paths";
import { getAppBaseUrlSync } from "@/modules/system-settings/integrationRuntime";
import {
  isWarmupsContentSectionLinkedId,
  type ReminderIntentSectionLookup,
} from "./resolveReminderIntentForLinkedObject";
import type { ReminderLinkedObjectType } from "./types";

const KNOWN: ReminderLinkedObjectType[] = [
  "lfk_complex",
  "content_section",
  "content_page",
  "custom",
  "rehab_program",
  "treatment_program_item",
];

function narrowLinkedType(raw: string | null): ReminderLinkedObjectType | null {
  if (!raw) return null;
  return (KNOWN as readonly string[]).includes(raw) ? (raw as ReminderLinkedObjectType) : null;
}

export type BuildReminderDeepLinkOptions = {
  /** Slugs разделов с `system_parent_code = warmups` (для legacy `generic` без intent). */
  warmupsSectionSlugs?: ReadonlySet<string>;
};

function isWarmupsSectionDeepLink(
  linkedObjectId: string,
  opts?: BuildReminderDeepLinkOptions,
): boolean {
  if (isWarmupsContentSectionLinkedId(linkedObjectId)) return true;
  const id = linkedObjectId.trim();
  return Boolean(id && opts?.warmupsSectionSlugs?.has(id));
}

/**
 * Patient deep links for integrator reminder payloads (STAGE_1_CONTRACTS S1.T07).
 * Base URL: admin `app_base_url` or env `APP_BASE_URL`.
 */
export function buildReminderDeepLink(
  params: {
    linkedObjectType: ReminderLinkedObjectType | string | null;
    linkedObjectId: string | null;
    reminderIntent?: string | null;
  },
  opts?: BuildReminderDeepLinkOptions,
): string {
  const base = getAppBaseUrlSync().replace(/\/$/, "");
  const intentRaw = typeof params.reminderIntent === "string" ? params.reminderIntent.trim() : "";
  if (intentRaw === "warmup") {
    return `${base}${routePaths.patientGoDailyWarmup}?from=reminder`;
  }
  if (intentRaw === "exercises" || intentRaw === "stretch") {
    return `${base}${routePaths.patientGoPlanStartLesson}?from=reminder`;
  }
  const linkedObjectType = narrowLinkedType(
    typeof params.linkedObjectType === "string" ? params.linkedObjectType : null,
  );
  const { linkedObjectId } = params;
  if (!linkedObjectType || !linkedObjectId?.trim()) {
    return `${base}/app/patient/reminders?from=reminder`;
  }
  const id = encodeURIComponent(linkedObjectId.trim());
  if (linkedObjectType === "content_section" && isWarmupsSectionDeepLink(linkedObjectId, opts)) {
    return `${base}${routePaths.patientGoDailyWarmup}?from=reminder`;
  }
  switch (linkedObjectType) {
    case "lfk_complex":
      return `${base}/app/patient/diary/lfk/journal?complexId=${id}&from=reminder`;
    case "content_section":
      return `${base}/app/patient/sections/${id}?from=reminder`;
    case "content_page":
      return `${base}/app/patient/content/${id}?from=reminder`;
    case "rehab_program":
      return `${base}/app/patient/treatment/${id}?from=reminder`;
    case "treatment_program_item": {
      const raw = linkedObjectId.trim();
      const colon = raw.indexOf(":");
      if (colon <= 0 || colon >= raw.length - 1) {
        return `${base}/app/patient/reminders?from=reminder`;
      }
      const instanceId = encodeURIComponent(raw.slice(0, colon));
      const itemId = encodeURIComponent(raw.slice(colon + 1));
      return `${base}/app/patient/treatment/${instanceId}/item/${itemId}?nav=exec&from=reminder`;
    }
    case "custom":
    default:
      return `${base}/app/patient/reminders?from=reminder`;
  }
}

/** Async fallback: warmups cluster по `system_parent_code`, если intent ещё `generic`. */
export async function buildReminderDeepLinkAsync(
  params: {
    linkedObjectType: ReminderLinkedObjectType | string | null;
    linkedObjectId: string | null;
    reminderIntent?: string | null;
  },
  lookup?: ReminderIntentSectionLookup,
  opts?: BuildReminderDeepLinkOptions,
): Promise<string> {
  const intentRaw = typeof params.reminderIntent === "string" ? params.reminderIntent.trim() : "";
  if (intentRaw === "warmup" || intentRaw === "exercises" || intentRaw === "stretch") {
    return buildReminderDeepLink(params, opts);
  }
  const linkedObjectType = narrowLinkedType(
    typeof params.linkedObjectType === "string" ? params.linkedObjectType : null,
  );
  const linkedObjectId = params.linkedObjectId?.trim() ?? "";
  if (linkedObjectType === "content_section" && linkedObjectId && lookup) {
    if (!isWarmupsSectionDeepLink(linkedObjectId, opts)) {
      const sec = await lookup.getBySlug(linkedObjectId);
      if (sec?.systemParentCode === "warmups") {
        const base = getAppBaseUrlSync().replace(/\/$/, "");
        return `${base}${routePaths.patientGoDailyWarmup}?from=reminder`;
      }
    }
  }
  return buildReminderDeepLink(params, opts);
}
