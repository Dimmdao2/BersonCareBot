/**
 * Patient deep links for integrator reminder sends (STAGE_1 S1.T07).
 * Mirrors webapp `buildReminderDeepLink` paths; base URL from admin `app_base_url` or env.
 */
import { getAppBaseUrlSync } from '../../../config/appBaseUrl.js';

const GO_DAILY_WARMUP = '/app/patient/go/daily-warmup?from=reminder';
const GO_PLAN_START_LESSON = '/app/patient/go/plan-start-lesson?from=reminder';
/** Canonical CMS warmups section slug (mirrors webapp `DEFAULT_WARMUPS_SECTION_SLUG`). */
const WARMUPS_SECTION_SLUG = 'warmups';

function isWarmupsContentSectionLinkedId(linkedObjectId: string | null | undefined): boolean {
  const id = typeof linkedObjectId === 'string' ? linkedObjectId.trim() : '';
  return id.length > 0 && id === WARMUPS_SECTION_SLUG;
}

/** Primary open URL для dispatch: warmup / exercises / stretch — go-URL в webapp (редирект как на главной / в плане). */
export function reminderDispatchUsesIntentOpenTarget(intent: string | null | undefined): boolean {
  const i = typeof intent === 'string' ? intent.trim() : '';
  return i === 'warmup' || i === 'exercises' || i === 'stretch';
}

const KNOWN = new Set([
  'lfk_complex',
  'content_section',
  'content_page',
  'custom',
  'rehab_program',
  'treatment_program_item',
]);

export type BuildPatientReminderDeepLinkOptions = {
  warmupsSectionSlugs?: ReadonlySet<string>;
};

function isWarmupsSectionDeepLink(
  linkedObjectId: string,
  opts?: BuildPatientReminderDeepLinkOptions,
): boolean {
  if (isWarmupsContentSectionLinkedId(linkedObjectId)) return true;
  const id = linkedObjectId.trim();
  return Boolean(id && opts?.warmupsSectionSlugs?.has(id));
}

export function buildPatientReminderDeepLink(
  params: {
    linkedObjectType: string | null | undefined;
    linkedObjectId: string | null | undefined;
    reminderIntent?: string | null | undefined;
  },
  opts?: BuildPatientReminderDeepLinkOptions,
): string {
  const base = getAppBaseUrlSync().replace(/\/$/, '');
  const intentRaw = typeof params.reminderIntent === 'string' ? params.reminderIntent.trim() : '';
  if (intentRaw === 'warmup') {
    return base ? `${base}${GO_DAILY_WARMUP}` : GO_DAILY_WARMUP;
  }
  if (intentRaw === 'exercises' || intentRaw === 'stretch') {
    return base ? `${base}${GO_PLAN_START_LESSON}` : GO_PLAN_START_LESSON;
  }
  if (!base) return '/app/patient/reminders?from=reminder';
  const rawType = typeof params.linkedObjectType === 'string' ? params.linkedObjectType.trim() : '';
  const linkedObjectType = KNOWN.has(rawType) ? rawType : null;
  const linkedObjectId = typeof params.linkedObjectId === 'string' ? params.linkedObjectId.trim() : '';
  if (!linkedObjectType || !linkedObjectId) {
    return `${base}/app/patient/reminders?from=reminder`;
  }
  if (linkedObjectType === 'content_section' && isWarmupsSectionDeepLink(linkedObjectId, opts)) {
    return base ? `${base}${GO_DAILY_WARMUP}` : GO_DAILY_WARMUP;
  }
  const id = encodeURIComponent(linkedObjectId);
  switch (linkedObjectType) {
    case 'lfk_complex':
      return `${base}/app/patient/diary/lfk/journal?complexId=${id}&from=reminder`;
    case 'content_section':
      return `${base}/app/patient/sections/${id}?from=reminder`;
    case 'content_page':
      return `${base}/app/patient/content/${id}?from=reminder`;
    case 'rehab_program':
      return `${base}/app/patient/treatment/${id}?from=reminder`;
    case 'treatment_program_item': {
      const raw = linkedObjectId.trim();
      const colon = raw.indexOf(':');
      if (colon <= 0 || colon >= raw.length - 1) {
        return `${base}/app/patient/reminders?from=reminder`;
      }
      const instanceId = encodeURIComponent(raw.slice(0, colon));
      const itemId = encodeURIComponent(raw.slice(colon + 1));
      return `${base}/app/patient/treatment/${instanceId}/item/${itemId}?nav=exec&from=reminder`;
    }
    default:
      return `${base}/app/patient/reminders?from=reminder`;
  }
}
