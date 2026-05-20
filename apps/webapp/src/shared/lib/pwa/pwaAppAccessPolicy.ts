export const PWA_APP_MESSENGER_ENTRY_PATHS = ["/app/tg", "/app/max"] as const;

export function normalizeAppPathname(pathname: string): string {
  const trimmed = pathname.trim() || "/";
  if (trimmed.length <= 1) return trimmed;
  return trimmed.replace(/\/+$/, "") || "/";
}

export function isPwaMessengerEntryPath(pathname: string): boolean {
  const normalized = normalizeAppPathname(pathname);
  return (PWA_APP_MESSENGER_ENTRY_PATHS as readonly string[]).includes(normalized);
}

/** `/app` and nested routes require installed PWA (standalone) unless exempt. */
export function browserRequiresPwaStandaloneForAppPath(pathname: string): boolean {
  const normalized = normalizeAppPathname(pathname);
  if (!normalized.startsWith("/app")) return false;
  if (isPwaMessengerEntryPath(normalized)) return false;
  return true;
}

export function hasAppEntryTokenQuery(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw.trim()) return false;
  const params = new URLSearchParams(raw);
  return Boolean((params.get("t") ?? params.get("token") ?? "").trim());
}

/** Deep link `?t=` / `?token=` on `/app` — legacy entry exchange in browser. */
export function isAppEntryTokenBypass(pathname: string, search: string): boolean {
  return normalizeAppPathname(pathname) === "/app" && hasAppEntryTokenQuery(search);
}

export type PwaAppAccessDecisionInput = {
  pathname: string;
  search: string;
  standalone: boolean;
  messengerMiniApp: boolean;
  /** Local dev: do not force PWA shell. */
  allowBrowserAccess?: boolean;
};

export function shouldAllowPwaAppShellAccess(input: PwaAppAccessDecisionInput): boolean {
  if (!browserRequiresPwaStandaloneForAppPath(input.pathname)) return true;
  if (input.allowBrowserAccess) return true;
  if (input.messengerMiniApp) return true;
  if (input.standalone) return true;
  if (isAppEntryTokenBypass(input.pathname, input.search)) return true;
  return false;
}

/** Marketing landing with install instructions; preserves deep link in `next`. */
export function buildPwaInstallLandingRedirectUrl(pathname: string, search: string): string {
  const returnTo = `${pathname}${search}`;
  const params = new URLSearchParams();
  if (returnTo && normalizeAppPathname(returnTo.split("?")[0] ?? "") !== "/app") {
    params.set("next", returnTo);
  } else if (search.trim()) {
    params.set("next", returnTo);
  }
  const query = params.toString();
  return query ? `/?${query}#install` : "/#install";
}
