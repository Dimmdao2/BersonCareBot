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
    // PLAT-01…09 slice 1 (2026-07-26): system-health moved out of the clinical/doctor URL space
    // into its own platform shell at /app/platform/*. This is a single exact-path entry (like
    // /app/doctor/clients below), not a prefix — see the /app/doctor/admin/booking note further
    // down for why a *prefix* redirect here is dangerous (it ran ahead of any session/role and
    // swallowed a live global-admin-only page for months). Slices 2-7 add sibling entries here
    // as each remaining `(global-admin)/doctor/**` page physically moves to `/app/platform/*`.
    "/app/doctor/system-health": "/app/platform/system-health",
    // PLAT-01…09 slice 2 (2026-07-26): health-archive and audit-log moved the same way. Same
    // reasoning — exact-path entries, not prefixes.
    "/app/doctor/health-archive": "/app/platform/health-archive",
    "/app/doctor/audit-log": "/app/platform/audit-log",
    // PLAT-01…09 slice 3 (2026-07-26): commercial (tariffs and trial) moved the same way.
    "/app/doctor/commercial": "/app/platform/commercial",
    // PLAT-01…09 slice 4 (2026-07-26): the whole admin/* subtree moved the same way — exact-path
    // entries, not prefixes. Two of these (form-public, payments) now render null; their removal
    // is an open owner question (OWNER_QUESTIONS_2026-07-26.md #6), not decided here.
    "/app/doctor/admin/app-settings": "/app/platform/admin/app-settings",
    "/app/doctor/admin/auth": "/app/platform/admin/auth",
    // Unlike the OLD "/app/doctor/admin/booking" note above (dated: this map had no entry for it
    // because a blanket redirect there would have swallowed the page while it still lived at this
    // URL via the (global-admin) route group), the page has now physically moved to
    // `/app/platform/admin/booking` and NOTHING serves this literal path any more — there is no
    // separate specialist-facing page.tsx here (grep-verified: zero page.tsx/layout.tsx anywhere
    // under `app/doctor/admin/`, only shared components consumed by the platform page above and
    // by unrelated specialist screens). The role-conflict that blocked a redirect no longer exists.
    "/app/doctor/admin/booking": "/app/platform/admin/booking",
    "/app/doctor/admin/booking/catalog": "/app/platform/admin/booking/catalog",
    "/app/doctor/admin/booking/form-public": "/app/platform/admin/booking/form-public",
    "/app/doctor/admin/booking/integrations": "/app/platform/admin/booking/integrations",
    "/app/doctor/admin/booking/payments": "/app/platform/admin/booking/payments",
    "/app/doctor/admin/integrations": "/app/platform/admin/integrations",
    "/app/doctor/admin/technical": "/app/platform/admin/technical",
    // Old /clients/ client-card list → new /patients/ card list (old client card removed).
    "/app/doctor/clients": "/app/doctor/patients",
    "/app/doctor/messages": "/app/doctor/communications?tab=chats",
    "/app/doctor/online-intake": "/app/doctor/communications?tab=intake",
    "/app/doctor/comments": "/app/doctor/communications?tab=comments",
    "/app/doctor/broadcasts/archive": "/app/doctor/communications?tab=broadcasts&archive=1",
    "/app/doctor/broadcasts": "/app/doctor/communications?tab=broadcasts",
    // Schedule legacy → real page-shell (e12). Tab values align with scheduleTabFromQuery: cal/work/setup.
    "/app/doctor/calendar": "/app/doctor/schedule?tab=cal",
    "/app/doctor/appointments": "/app/doctor/schedule?tab=cal",
    // SUPERSEDED by PLAT-01…09 slice 4 (2026-07-26): "/app/doctor/admin/booking" used to be
    // deliberately NOT redirected here, because this map runs in middleware (no role information)
    // and the page still lived at that exact URL via the (global-admin) route group — a blanket
    // redirect would have swallowed it for the one caller (the global admin) it was real for. The
    // page has now physically moved to /app/platform/admin/booking (see the entry above), so the
    // old URL has no live handler for anyone and the redirect is safe and present above.
    // Analytics legacy subpages → aggregate page-shell. Tabs align with analyticsTabFromQuery.
    // (material-ratings остаётся отдельным маршрутом — подробная таблица оценок, ссылка из вкладки «Контент».)
    "/app/doctor/analytics/clients": "/app/doctor/analytics?tab=clients",
    "/app/doctor/usage": "/app/doctor/analytics?tab=app",
    "/app/doctor/analytics/notifications": "/app/doctor/analytics?tab=notifications",
  };

  const redirectTarget = legacyRedirects[pathname];
  if (redirectTarget) {
    const url = request.nextUrl.clone();
    const [targetPath, targetQuery] = redirectTarget.split("?");
    url.pathname = targetPath!;
    url.search = targetQuery ? `?${targetQuery}` : "";
    return NextResponse.redirect(url, 308);
  }

  // /app/doctor/clients/:userId[/treatment-programs/:instanceId] → новая карточка /patients/.
  // (Старая карточка-клиента удаляется; здесь — сетка безопасности для любых оставшихся
  // ссылок/закладок. name-match-hints — админ-инструмент слияния без /patients/-эквивалента,
  // оставляем как есть.) Query сохраняется (clone) → discussionItem/focusItemId доезжают.
  if (pathname.startsWith("/app/doctor/clients/") && pathname !== "/app/doctor/clients/name-match-hints") {
    const clientProgram = pathname.match(/^\/app\/doctor\/clients\/([^/]+)\/treatment-programs\/([^/]+)$/);
    if (clientProgram) {
      const url = request.nextUrl.clone();
      url.pathname = `/app/doctor/patients/${clientProgram[1]}/programs/${clientProgram[2]}`;
      return NextResponse.redirect(url, 308);
    }
    const clientProfile = pathname.match(/^\/app\/doctor\/clients\/([^/]+)$/);
    if (clientProfile) {
      const url = request.nextUrl.clone();
      url.pathname = `/app/doctor/patients/${clientProfile[1]}`;
      return NextResponse.redirect(url, 308);
    }
  }

  // /app/doctor/communications и /app/doctor/schedule — настоящие страницы-шеллы.
  // Internal rewrite не нужен: Next.js рендерит реальные page.tsx.
  // 308 со старых прямых URL выше сохранены.

  return null;
}
