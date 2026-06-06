/**
 * Cross-zone access block (волна 2): редирект на свой hub + одноразовый query для toast.
 * Guards (2.A2/A3) вызывают {@link buildOwnHubUrlWithAccessDeniedToast}; shell (2.A1) — toast + strip query.
 */
import toast from "react-hot-toast";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import type { UserRole } from "@/shared/types/session";

export const APP_ACCESS_DENIED_QUERY_KEY = "app_access_denied";
export const APP_ACCESS_DENIED_QUERY_VALUE = "1";
export const APP_ACCESS_DENIED_TOAST_MESSAGE = "Нет доступа к этому разделу";

export function getOwnHubPathForRole(role: UserRole): string {
  return getRedirectPathForRole(role);
}

/** Server redirect target: свой hub + флаг для client-side toast (без отдельной forbidden-страницы). */
export function buildOwnHubUrlWithAccessDeniedToast(role: UserRole): string {
  const hub = getOwnHubPathForRole(role);
  const params = new URLSearchParams();
  params.set(APP_ACCESS_DENIED_QUERY_KEY, APP_ACCESS_DENIED_QUERY_VALUE);
  return `${hub}?${params.toString()}`;
}

function toSearchParams(search: string | URLSearchParams | null | undefined): URLSearchParams | null {
  if (search == null) return null;
  if (search instanceof URLSearchParams) return search;
  const trimmed = search.trim();
  if (!trimmed) return new URLSearchParams();
  const raw = trimmed.startsWith("?") ? trimmed.slice(1) : trimmed;
  return new URLSearchParams(raw);
}

export function searchParamsHasAccessDeniedToast(
  search: string | URLSearchParams | null | undefined,
): boolean {
  const params = toSearchParams(search);
  if (!params) return false;
  return params.get(APP_ACCESS_DENIED_QUERY_KEY) === APP_ACCESS_DENIED_QUERY_VALUE;
}

/** Убирает флаг toast из query; pathname не меняется. */
export function stripAccessDeniedToastFromUrl(
  pathname: string,
  search: string,
): { pathname: string; search: string } {
  const params = toSearchParams(search) ?? new URLSearchParams();
  params.delete(APP_ACCESS_DENIED_QUERY_KEY);
  const next = params.toString();
  return {
    pathname,
    search: next ? `?${next}` : "",
  };
}

/** Показывает стандартный toast, если в URL есть флаг. Возвращает true, если toast показан. */
export function showAppAccessDeniedToastIfFlagged(
  search: string | URLSearchParams | null | undefined,
): boolean {
  if (!searchParamsHasAccessDeniedToast(search)) return false;
  toast(APP_ACCESS_DENIED_TOAST_MESSAGE);
  return true;
}
