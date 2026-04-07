/**
 * Единая политика редиректов и безопасного next.
 * Используется в auth service, guards, app entry page и AuthBootstrap.
 */
import type { UserRole } from "@/shared/types/session";
import { routePaths } from "@/app-layer/routes/paths";

const SAFE_NEXT_PREFIX = "/app/patient";
const SAFE_NEXT_EXCLUDE = "/app/patient/bind-phone";

/** Путь для редиректа по роли (doctor и admin ведут в один workspace). */
export function getRedirectPathForRole(role: UserRole): string {
  if (role === "doctor" || role === "admin") return routePaths.doctor;
  return routePaths.patient;
}

/** Проверка, что next= безопасен для редиректа (только patient subtree, без bind-phone). */
export function isSafeNext(next: string | null): next is string {
  if (!next || typeof next !== "string") return false;
  const path = next.startsWith("/") ? next : new URL(next, "http://localhost").pathname;
  return path.startsWith(SAFE_NEXT_PREFIX) && !path.startsWith(SAFE_NEXT_EXCLUDE);
}

/**
 * Целевой путь после входа:
 * - doctor/admin: всегда workspace по роли (игнорируем next/fallback),
 * - client: безопасный next, затем безопасный fallback из API, затем путь по роли.
 */
export function getPostAuthRedirectTarget(
  role: UserRole,
  nextParam: string | null,
  fallbackRedirectTo?: string | null,
): string {
  if (role !== "client") return getRedirectPathForRole(role);
  if (isSafeNext(nextParam)) return nextParam;
  const fallback = fallbackRedirectTo ?? null;
  if (isSafeNext(fallback)) return fallback;
  return getRedirectPathForRole(role);
}
