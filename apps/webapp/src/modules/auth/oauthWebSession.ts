import { recordAuthLogin } from '@/app-layer/product-analytics/recordAuthLogin';
import { env } from '@/config/env';
import { setSessionFromUser } from '@/modules/auth/service';
import { getPostAuthRedirectTarget } from '@/modules/auth/redirectPolicy';
import { roleCanUsePortal, type RoleLoginPortal } from '@/modules/auth/roleLogin';
import type { UserByPhonePort } from '@/modules/auth/userByPhonePort';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';

export function oauthWebLoginErrorRedirect(reason: string): string {
  return `/app?oauth=error&reason=${encodeURIComponent(reason)}`;
}

/**
 * Общий финал публичного OAuth: сессия и абсолютный URL редиректа (или URL ошибки).
 */
export async function completeOAuthWebLoginRedirectUrls(opts: {
  userId: string;
  displayNameHint: string;
  authMethod: string;
  userByPhone: UserByPhonePort;
  next?: string | null;
  roleLoginPortal: RoleLoginPortal;
  appBaseUrl?: string;
}): Promise<{ ok: true; redirectUrl: string } | { ok: false; reason: string }> {
  const appBase = opts.appBaseUrl ?? env.APP_BASE_URL;
  let sessionUser;
  try {
    if (isPlatformUserUuid(opts.userId)) {
      enterStaffSecuritySelfPrincipal(opts.userId, 'auth/oauth-web:provider-verified-self');
    }
    sessionUser = await opts.userByPhone.findByUserId(opts.userId);
  } catch {
    return { ok: false, reason: 'db_error' };
  }

  if (!sessionUser) {
    return { ok: false, reason: 'session_failed' };
  }

  const role = sessionUser.role;

  // This is the single OAuth session-mint boundary. The signed door is authoritative even on the
  // shared DEV/TEST Host, where Host-derived surfaces intentionally collapse to `staff`.
  if (!roleCanUsePortal(role, opts.roleLoginPortal)) {
    return { ok: false, reason: 'oauth_role_not_allowed' };
  }

  const hint = opts.displayNameHint.trim();
  try {
    await setSessionFromUser(
      {
        ...sessionUser,
        role,
        displayName: hint || sessionUser.displayName || sessionUser.phone || opts.userId,
      },
      opts.authMethod,
    );
  } catch {
    return { ok: false, reason: 'session_failed' };
  }

  await recordAuthLogin({
    userId: opts.userId,
    entryChannel: 'browser',
    authMethod: opts.authMethod,
  });

  const finalRedirect = getPostAuthRedirectTarget(
    role,
    opts.next ?? null,
    null,
    opts.roleLoginPortal,
  );
  return { ok: true, redirectUrl: new URL(finalRedirect, appBase).toString() };
}
