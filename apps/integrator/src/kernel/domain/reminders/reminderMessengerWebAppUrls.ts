/**
 * Wraps patient reminder targets in signed webapp entry URLs for Telegram / MAX mini-apps.
 */
import type { DbPort } from '../../contracts/index.js';
import { getAppBaseUrl } from '../../../config/appBaseUrl.js';
import { buildWebappEntryUrl, buildWebappEntryUrlForMax } from '../../../integrations/webappEntryToken.js';

/** Align with `buildLinksFromBody` / patient WebApp: entry context for in-bot opens. */
function webappEntryWithBotCtx(entry: string): string {
  if (!entry || entry.includes('ctx=bot')) return entry;
  return `${entry}&ctx=bot`;
}

/** Path + query for `next=` from an absolute patient URL or a path. */
export function patientPathFromReminderTargetUrl(targetUrl: string): string {
  const t = targetUrl.trim();
  if (!t) return '/app/patient/reminders?from=reminder';
  if (t.startsWith('/')) return t;
  try {
    const u = new URL(t);
    return `${u.pathname}${u.search}`;
  } catch {
    return '/app/patient/reminders?from=reminder';
  }
}

export async function buildExerciseReminderWebAppUrls(params: {
  db: DbPort;
  channel: 'telegram' | 'max';
  chatId: number;
  externalId: string;
  integratorUserId: string;
  reminderTargetUrl: string;
}): Promise<{ primaryWebAppUrl: string; scheduleWebAppUrl: string } | null> {
  const base = await getAppBaseUrl(params.db);
  const pathPrimary = patientPathFromReminderTargetUrl(params.reminderTargetUrl);
  const pathSchedule = '/app/patient/reminders?from=reminder';
  if (params.channel === 'telegram') {
    const entry = buildWebappEntryUrl(
      { chatId: params.chatId, integratorUserId: params.integratorUserId },
      base,
    );
    if (!entry) return null;
    const entryCtx = webappEntryWithBotCtx(entry);
    return {
      primaryWebAppUrl: `${entryCtx}&next=${encodeURIComponent(pathPrimary)}`,
      scheduleWebAppUrl: `${entryCtx}&next=${encodeURIComponent(pathSchedule)}`,
    };
  }
  const entry = buildWebappEntryUrlForMax(
    { maxId: params.externalId, integratorUserId: params.integratorUserId },
    base,
  );
  if (!entry) return null;
  const entryCtx = webappEntryWithBotCtx(entry);
  return {
    primaryWebAppUrl: `${entryCtx}&next=${encodeURIComponent(pathPrimary)}`,
    scheduleWebAppUrl: `${entryCtx}&next=${encodeURIComponent(pathSchedule)}`,
  };
}
