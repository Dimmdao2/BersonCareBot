import { routePaths } from "@/app-layer/routes/paths";

/** Редирект на экран входа с сохранением целевого пути (Phase 4.5 auth-on-drilldown). */
export function appLoginWithNextHref(nextPath: string): string {
  const normalized = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${routePaths.root}?next=${encodeURIComponent(normalized)}`;
}

/** Для анонима: внутренний путь → login+next; иначе без изменений. */
export function hrefForPatientHomeDrilldown(internalPath: string, anonymousGuest: boolean): string {
  if (!anonymousGuest) return internalPath;
  return appLoginWithNextHref(internalPath);
}

/**
 * Без сессии не полагаемся на `/api/media/*` в превью (политика доступа к media не меняется).
 * Внешние/legacy URL оставляем — деградация только для CMS media prefix.
 */
export function stripApiMediaForAnonymousGuest(imageUrl: string | null, anonymousGuest: boolean): string | null {
  if (!anonymousGuest || !imageUrl?.trim()) return imageUrl;
  return imageUrl.startsWith("/api/media/") ? null : imageUrl;
}
