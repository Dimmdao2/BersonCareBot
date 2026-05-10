/**
 * Patient deep links for integrator reminder sends (STAGE_1 S1.T07).
 * Mirrors webapp `buildReminderDeepLink` paths; base URL from admin `app_base_url` or env.
 */
import { getAppBaseUrlSync } from '../../../config/appBaseUrl.js';

const KNOWN = new Set([
  'lfk_complex',
  'content_section',
  'content_page',
  'custom',
  'rehab_program',
  'treatment_program_item',
]);

export function buildPatientReminderDeepLink(params: {
  linkedObjectType: string | null | undefined;
  linkedObjectId: string | null | undefined;
}): string {
  const base = getAppBaseUrlSync().replace(/\/$/, '');
  if (!base) return '/app/patient/reminders?from=reminder';
  const rawType = typeof params.linkedObjectType === 'string' ? params.linkedObjectType.trim() : '';
  const linkedObjectType = KNOWN.has(rawType) ? rawType : null;
  const linkedObjectId = typeof params.linkedObjectId === 'string' ? params.linkedObjectId.trim() : '';
  if (!linkedObjectType || !linkedObjectId) {
    return `${base}/app/patient/reminders?from=reminder`;
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
