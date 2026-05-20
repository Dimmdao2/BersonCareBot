import { routePaths } from "@/app-layer/routes/paths";

export const PWA_APP_MESSENGER_ENTRY_PATHS = ["/app/tg", "/app/max"] as const;

function normalizeAppPathname(pathname: string): string {
  const trimmed = pathname.trim() || "/";
  if (trimmed.length <= 1) return trimmed;
  return trimmed.replace(/\/+$/, "") || "/";
}

const PATIENT_APP_ROOT = normalizeAppPathname(routePaths.patient);

export function isPatientPwaGatedPath(pathname: string): boolean {
  const normalized = normalizeAppPathname(pathname);
  return normalized === PATIENT_APP_ROOT || normalized.startsWith(`${PATIENT_APP_ROOT}/`);
}

export function isPwaMessengerEntryPath(pathname: string): boolean {
  const normalized = normalizeAppPathname(pathname);
  return (PWA_APP_MESSENGER_ENTRY_PATHS as readonly string[]).includes(normalized);
}

/** Patient cabinet (`/app/patient/**`) requires installed PWA (standalone) unless exempt. Doctor/admin/settings — browser OK. */
export function browserRequiresPwaStandaloneForAppPath(pathname: string): boolean {
  return isPatientPwaGatedPath(pathname);
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
  return false;
}

/** Marketing landing with install instructions; preserves deep link in `next`. */
export function buildPwaInstallLandingRedirectUrl(pathname: string, search: string): string {
  const returnTo = `${pathname}${search}`;
  const params = new URLSearchParams();
  if (isPatientPwaGatedPath(returnTo.split("?")[0] ?? "") || search.trim()) {
    params.set("next", returnTo);
  }
  const query = params.toString();
  return query ? `/?${query}#install` : "/#install";
}
