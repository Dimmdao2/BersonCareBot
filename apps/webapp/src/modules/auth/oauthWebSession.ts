import { recordAuthLogin } from '@/app-layer/product-analytics/recordAuthLogin';
import { env } from '@/config/env';
import { setSessionFromUser } from '@/modules/auth/service';
import { getPostAuthRedirectTarget } from '@/modules/auth/redirectPolicy';
import { reconcileDbRoleWithEnvRole, resolveRoleAsync } from '@/modules/auth/envRole';
import type { RoleLoginPortal } from '@/modules/auth/roleLogin';
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
  authMethod?: string;
  userByPhone: UserByPhonePort;
  next?: string | null;
  roleLoginPortal?: RoleLoginPortal | null;
}): Promise<{ ok: true; redirectUrl: string } | { ok: false; reason: string }> {
  const appBase = env.APP_BASE_URL;
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

  // C-4 (2026-07-26): `resolveRoleAsync` never promotes anyone anymore (envRole.ts) — reconciled
  // against the just-read DB role so this can never demote an existing staff account (it used to
  // overwrite `sessionUser.role` outright here, which — once the lists stopped granting anything —
  // would have logged every doctor/admin out of their own role on every Yandex/OAuth login).
  const role = reconcileDbRoleWithEnvRole(
    sessionUser.role,
    await resolveRoleAsync({
      phone: sessionUser.phone,
      telegramId: sessionUser.bindings.telegramId,
      maxId: sessionUser.bindings.maxId,
    }),
  );

  const hint = opts.displayNameHint.trim();
  try {
    await setSessionFromUser({
      ...sessionUser,
      role,
      displayName: hint || sessionUser.displayName || sessionUser.phone || opts.userId,
    });
  } catch {
    return { ok: false, reason: 'session_failed' };
  }

  await recordAuthLogin({
    userId: opts.userId,
    entryChannel: 'browser',
    authMethod: opts.authMethod ?? 'oauth_web',
  });

  const finalRedirect = getPostAuthRedirectTarget(
    role,
    opts.next ?? null,
    null,
    opts.roleLoginPortal ?? null,
  );
  return { ok: true, redirectUrl: new URL(finalRedirect, appBase).toString() };
}
