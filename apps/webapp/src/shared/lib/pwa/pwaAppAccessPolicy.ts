export const PWA_APP_MESSENGER_ENTRY_PATHS = ["/app/tg", "/app/max"] as const;

function normalizeAppPathname(pathname: string): string {
  const trimmed = pathname.trim() || "/";
  if (trimmed.length <= 1) return trimmed;
  return trimmed.replace(/\/+$/, "") || "/";
}

export function isPwaMessengerEntryPath(pathname: string): boolean {
  const normalized = normalizeAppPathname(pathname);
  return (PWA_APP_MESSENGER_ENTRY_PATHS as readonly string[]).includes(normalized);
}

/** Browser access is complete for every cabinet path; install is a capability-level prompt, not a route gate. */
export function browserRequiresPwaStandaloneForAppPath(pathname: string): boolean {
  void pathname;
  return false;
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
  return !browserRequiresPwaStandaloneForAppPath(input.pathname);
}
