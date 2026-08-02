import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Обрабатывает маршруты кабинета врача:
 * 1. 308-редиректы: старые URL → новые агрегирующие страницы (видны браузеру).
 *
 * После добавления реальной страницы `/app/doctor/schedule` (этап 12) виртуальный
 * rewrite schedule → legacy был удалён. Маркер REWRITE_MARKER_HEADER сохранён для
 * обратной совместимости с другими возможными rewrite в прокси — досрочный выход при
 * повторном входе после rewrite.
 */
const REWRITE_MARKER_HEADER = 'x-bc-doctor-rewrite';

export function doctorRouteRedirectResponse(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  // Повторный вход после внутреннего rewrite (proxy.ts) — пропускаем всю логику.
  if (request.headers.get(REWRITE_MARKER_HEADER) === '1') return null;

  // ── 308 redirects: old URLs → new aggregate URLs ──────────────────────────

  const legacyRedirects: Record<string, string> = {
    // PLAT-01…09 slices 1-4 (2026-07-26) moved these out of the clinical/doctor URL space into a
    // new `/app/platform/*` shell, one exact-path entry at a time (like /app/doctor/clients below),
    // never a prefix — see the /app/doctor/admin/booking note further down for why a *prefix*
    // redirect here is dangerous (it once ran ahead of any session/role and swallowed a live
    // global-admin-only page for months).
    //
    // Owner ruling 2026-07-26 (final home): "/app/platform/*" was renamed to "/app/admin/*" the
    // same day, merging with the pre-existing `/app/admin` (which only served `/app/admin/promo`,
    // untouched by this rename — see app/app/admin/promo/page.tsx). The nested `admin/*` settings
    // subtree is flattened one level here too (no "/app/admin/admin/*"). Every entry below now
    // points straight at the FINAL `/app/admin/*` URL — never a two-hop chain through the
    // now-deleted `/app/platform/*` shell.
    '/app/doctor/system-health': '/app/admin/system-health',
    '/app/doctor/health-archive': '/app/admin/health-archive',
    '/app/doctor/audit-log': '/app/admin/audit-log',
    '/app/doctor/commercial': '/app/admin/commercial',
    // Two of these (form-public, payments) now render null; their removal is an open owner
    // question (OWNER_QUESTIONS_2026-07-26.md #6), not decided here.
    '/app/doctor/admin/app-settings': '/app/admin/app-settings',
    '/app/doctor/admin/auth': '/app/admin/auth',
    // Unlike the OLD "/app/doctor/admin/booking" note above (dated: this map had no entry for it
    // because a blanket redirect there would have swallowed the page while it still lived at this
    // URL via the (global-admin) route group), the page has long since physically moved off this
    // path and NOTHING serves this literal path any more — there is no separate specialist-facing
    // page.tsx here (grep-verified: zero page.tsx/layout.tsx anywhere under `app/doctor/admin/`,
    // only shared components consumed by the admin page below and by unrelated specialist
    // screens). The role-conflict that blocked a redirect no longer exists.
    '/app/doctor/admin/booking': '/app/admin/booking',
    '/app/doctor/admin/booking/catalog': '/app/admin/booking/catalog',
    '/app/doctor/admin/booking/form-public': '/app/admin/booking/form-public',
    '/app/doctor/admin/booking/payments': '/app/admin/booking/payments',
    '/app/doctor/admin/integrations': '/app/admin/integrations',
    '/app/doctor/admin/technical': '/app/admin/technical',
    // The rename above deleted the entire `/app/platform/*` app-router tree in one commit — a
    // clean cutover, not a phased move, so there is no live page left under `/app/platform/*` for
    // a prefix rule to swallow. Exact-path entries are still used, for the same
    // review-every-mapping discipline as the rest of this file, covering an owner tab/bookmark
    // opened earlier the same day against the now-retired `/app/platform/*` URLs.
    '/app/platform/system-health': '/app/admin/system-health',
    '/app/platform/health-archive': '/app/admin/health-archive',
    '/app/platform/audit-log': '/app/admin/audit-log',
    '/app/platform/commercial': '/app/admin/commercial',
    '/app/platform/admin/app-settings': '/app/admin/app-settings',
    '/app/platform/admin/auth': '/app/admin/auth',
    '/app/platform/admin/booking': '/app/admin/booking',
    '/app/platform/admin/booking/catalog': '/app/admin/booking/catalog',
    '/app/platform/admin/booking/form-public': '/app/admin/booking/form-public',
    '/app/platform/admin/booking/payments': '/app/admin/booking/payments',
    '/app/platform/admin/integrations': '/app/admin/integrations',
    '/app/platform/admin/technical': '/app/admin/technical',
    // Old /clients/ client-card list → new /patients/ card list (old client card removed).
    '/app/doctor/clients': '/app/doctor/patients',
    '/app/doctor/messages': '/app/doctor/communications?tab=chats',
    '/app/doctor/comments': '/app/doctor/communications?tab=comments',
    '/app/doctor/broadcasts/archive': '/app/doctor/communications?tab=broadcasts&archive=1',
    '/app/doctor/broadcasts': '/app/doctor/communications?tab=broadcasts',
    // Schedule legacy → real page-shell (e12). Tab values align with scheduleTabFromQuery: cal/work/setup.
    '/app/doctor/calendar': '/app/doctor/schedule?tab=cal',
    '/app/doctor/appointments': '/app/doctor/schedule?tab=cal',
    // Analytics legacy subpages → aggregate page-shell. Tabs align with analyticsTabFromQuery.
    // (material-ratings остаётся отдельным маршрутом — подробная таблица оценок, ссылка из вкладки «Контент».)
    '/app/doctor/analytics/clients': '/app/doctor/analytics?tab=clients',
    '/app/doctor/usage': '/app/doctor/analytics?tab=app',
    '/app/doctor/analytics/notifications': '/app/doctor/analytics?tab=notifications',
  };

  const redirectTarget = legacyRedirects[pathname];
  if (redirectTarget) {
    const url = request.nextUrl.clone();
    const [targetPath, targetQuery] = redirectTarget.split('?');
    url.pathname = targetPath!;
    url.search = targetQuery ? `?${targetQuery}` : '';
    return NextResponse.redirect(url, 308);
  }

  // /app/doctor/clients/:userId[/treatment-programs/:instanceId] → новая карточка /patients/.
  // (Старая карточка-клиента удаляется; здесь — сетка безопасности для любых оставшихся
  // ссылок/закладок. name-match-hints — админ-инструмент слияния без /patients/-эквивалента,
  // оставляем как есть.) Query сохраняется (clone) → discussionItem/focusItemId доезжают.
  if (
    pathname.startsWith('/app/doctor/clients/') &&
    pathname !== '/app/doctor/clients/name-match-hints'
  ) {
    const clientProgram = pathname.match(
      /^\/app\/doctor\/clients\/([^/]+)\/treatment-programs\/([^/]+)$/,
    );
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
