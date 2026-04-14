import { getAppBaseUrl } from "@/modules/system-settings/integrationRuntime";
import { setSessionFromUser } from "@/modules/auth/service";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { resolveRoleAsync } from "@/modules/auth/envRole";
import { pgUserByPhonePort } from "@/infra/repos/pgUserByPhone";
import { routePaths } from "@/app-layer/routes/paths";

export function oauthWebLoginErrorRedirect(reason: string): string {
  return `/app?oauth=error&reason=${encodeURIComponent(reason)}`;
}

/**
 * Общий финал публичного OAuth: сессия и абсолютный URL редиректа (или URL ошибки).
 */
export async function completeOAuthWebLoginRedirectUrls(opts: {
  userId: string;
  displayNameHint: string;
}): Promise<{ ok: true; redirectUrl: string } | { ok: false; reason: string }> {
  const appBase = await getAppBaseUrl();
  let sessionUser;
  try {
    sessionUser = await pgUserByPhonePort.findByUserId(opts.userId);
  } catch {
    return { ok: false, reason: "db_error" };
  }

  if (!sessionUser) {
    return { ok: false, reason: "session_failed" };
  }

  const role = await resolveRoleAsync({
    phone: sessionUser.phone,
    telegramId: sessionUser.bindings.telegramId,
    maxId: sessionUser.bindings.maxId,
  });

  const hint = opts.displayNameHint.trim();
  try {
    await setSessionFromUser({
      ...sessionUser,
      role,
      displayName: hint || sessionUser.displayName || sessionUser.phone || opts.userId,
    });
  } catch {
    return { ok: false, reason: "session_failed" };
  }

  const finalRedirect = getRedirectPathForRole(role);

  if (!sessionUser.phone) {
    const bindPhoneUrl = new URL(routePaths.bindPhone, appBase);
    bindPhoneUrl.searchParams.set("next", finalRedirect);
    bindPhoneUrl.searchParams.set("reason", "oauth_phone_required");
    return { ok: true, redirectUrl: bindPhoneUrl.toString() };
  }

  return { ok: true, redirectUrl: new URL(finalRedirect, appBase).toString() };
}
