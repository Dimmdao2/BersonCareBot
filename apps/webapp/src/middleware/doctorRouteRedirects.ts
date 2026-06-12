import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Обрабатывает маршруты кабинета врача:
 * 1. 308-редиректы: старые URL → новые агрегирующие страницы (видны браузеру).
 *
 * После добавления реальной страницы `/app/doctor/schedule` (этап 12) виртуальный
 * rewrite schedule → legacy был удалён. Маркер REWRITE_MARKER_HEADER сохранён для
 * обратной совместимости с другими возможными rewrite в прокси — досрочный выход при
 * повторном входе после rewrite.
 */
const REWRITE_MARKER_HEADER = "x-bc-doctor-rewrite";

export function doctorRouteRedirectResponse(
  request: NextRequest,
): NextResponse | null {
  const { pathname } = request.nextUrl;

  // Повторный вход после внутреннего rewrite (proxy.ts) — пропускаем всю логику.
  if (request.headers.get(REWRITE_MARKER_HEADER) === "1") return null;

  // ── 308 redirects: old URLs → new aggregate URLs ──────────────────────────

  // /app/doctor/online-intake/:requestId → /app/doctor/communications?tab=intake&id=:requestId
  const intakeDetail = pathname.match(/^\/app\/doctor\/online-intake\/([^/]+)$/);
  if (intakeDetail) {
    const id = intakeDetail[1];
    const url = request.nextUrl.clone();
    url.pathname = "/app/doctor/communications";
    url.search = "";
    url.searchParams.set("tab", "intake");
    if (id) url.searchParams.set("id", id);
    return NextResponse.redirect(url, 308);
  }

  const legacyRedirects: Record<string, string> = {
    "/app/doctor/messages": "/app/doctor/communications?tab=chats",
    "/app/doctor/online-intake": "/app/doctor/communications?tab=intake",
    "/app/doctor/comments": "/app/doctor/communications?tab=comments",
    "/app/doctor/broadcasts/archive": "/app/doctor/communications?tab=broadcasts&archive=1",
    "/app/doctor/broadcasts": "/app/doctor/communications?tab=broadcasts",
    // Schedule legacy → real page-shell (e12). Tab values align with scheduleTabFromQuery: cal/work/setup.
    "/app/doctor/calendar": "/app/doctor/schedule?tab=cal",
    "/app/doctor/appointments": "/app/doctor/schedule?tab=cal",
    "/app/doctor/admin/booking": "/app/doctor/schedule?tab=setup",
  };

  const redirectTarget = legacyRedirects[pathname];
  if (redirectTarget) {
    const url = request.nextUrl.clone();
    const [targetPath, targetQuery] = redirectTarget.split("?");
    url.pathname = targetPath!;
    url.search = targetQuery ? `?${targetQuery}` : "";
    return NextResponse.redirect(url, 308);
  }

  // /app/doctor/communications и /app/doctor/schedule — настоящие страницы-шеллы.
  // Internal rewrite не нужен: Next.js рендерит реальные page.tsx.
  // 308 со старых прямых URL выше сохранены.

  return null;
}
