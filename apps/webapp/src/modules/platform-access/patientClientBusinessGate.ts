import { webappRuntimeDatabaseIsConfigured } from '@/config/env';
import type { AppSession } from '@/shared/types/session';
import { resolvePlatformAccessContext } from './resolvePlatformAccessContext';
import { getPlatformEntry } from '@/shared/lib/platformCookie.server';

export type PatientBusinessGate = 'allow' | 'need_activation' | 'stale_session';

/**
 * Для `client`: при наличии `DATABASE_URL` — только `tier === "patient"` (`resolvePlatformAccessContext`);
 * иначе onboarding / legacy cookie не проходят (DoD §2 / SPEC §4). При ошибке БД — **fail-safe** `need_activation` (не поднимать доступ по snapshot при неизвестном tier).
 * Для прочих ролей — `allow` (их политика — отдельные guards).
 */
export async function patientClientBusinessGate(session: AppSession): Promise<PatientBusinessGate> {
  if (session.user.role !== 'client') return 'allow';

  if (webappRuntimeDatabaseIsConfigured()) {
    try {
      const ctx = await resolvePlatformAccessContext({
        sessionUserId: session.user.userId,
        sessionRoleHint: session.user.role,
      });
      if (ctx.resolution === 'session_user_missing') return 'stale_session';
      if (ctx.tier !== 'patient') {
        // Determine whether current entry is a messenger/miniapp entry using platform cookie
        // (set by middleware or auth exchange). If entry is `bot` then keep phone-gate;
        // otherwise allow web/PWA/email/OAuth sessions to proceed even without phone.
        try {
          const entry = await getPlatformEntry();
          return entry === 'bot' ? 'need_activation' : 'allow';
        } catch (err) {
          // Treat failures to determine platform entry as non-bot (standalone) to
          // avoid blocking regular web/PWA/email/OAuth users due to platform detection errors.
          try {
            console.warn('[platform_access] getPlatformEntry failed, treating entry as standalone');
          } catch {}
          return 'allow';
        }
      }
      return 'allow';
    } catch (err) {
      // Fail-safe need_activation on any DB/resolution error (DoD §2). Log so a real outage here
      // (e.g. a missing app_patient grant) is visible instead of presenting as a silent 403 on
      // every patient route -- confirmed live on TEST (taskdb #667 follow-up, 2026-07-13): this
      // catch was swallowing "permission denied for table user_oauth_bindings" from
      // resolvePlatformAccessContext, downgrading it to need_activation with zero server-side trace.
      try {
        console.error('[platform_access] patientClientBusinessGate resolution failed', err);
      } catch {}
      return 'need_activation';
    }
  }

  return session.user.phone?.trim() ? 'allow' : 'need_activation';
}
