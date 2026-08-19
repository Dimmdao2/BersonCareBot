import { webappRuntimeDatabaseIsConfigured } from '@/config/env';
import type { AppSession } from '@/shared/types/session';
import { resolvePlatformAccessContext } from './resolvePlatformAccessContext';

/**
 * Tier **patient** (доверенный телефон) — может смотреть разделы/страницы с `requires_auth`.
 * Onboarding без tier и гости — только публичные (`requires_auth = false`).
 */
export async function resolvePatientCanViewAuthOnlyContent(
  session: AppSession | null,
): Promise<boolean> {
  if (!session?.user || session.user.role !== 'client') {
    return false;
  }
  if (!webappRuntimeDatabaseIsConfigured()) {
    return Boolean(session.user.phone?.trim());
  }
  try {
    const ctx = await resolvePlatformAccessContext({
      sessionUserId: session.user.userId,
      sessionRoleHint: session.user.role,
    });
    return ctx.tier === 'patient';
  } catch (error) {
    // Staying closed is deliberate and unchanged — an unreadable tier is not a grant. What changed is
    // that it is no longer silent. This resolver decides whether a signed-in patient sees their diary,
    // reminders and home sections at all, and a refused read (42501) produced exactly the same `false`
    // as "this session is a guest", so the patient watched their own content disappear while the
    // journal said nothing. The tier check above is what distinguishes the two: every legitimate deny
    // returns before this point, so anything landing here is an infrastructure failure by definition.
    const code =
      typeof (error as { code?: unknown } | null)?.code === 'string'
        ? (error as { code: string }).code
        : 'unknown';
    console.error('[platform-access] patient tier read failed; content stays gated', {
      category: code === '42501' ? 'capability_denied' : 'repository_unavailable',
      errorClass: error instanceof Error ? error.name : 'unknown',
      code,
    });
    return false;
  }
}
