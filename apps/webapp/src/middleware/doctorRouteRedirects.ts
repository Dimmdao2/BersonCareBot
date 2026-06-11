import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Обрабатывает маршруты кабинета врача:
 * 1. 308-редиректы: старые URL → новые агрегирующие страницы (видны браузеру).
 * 2. Внутренние rewrite: новые URL → легаси-страницы (браузер видит новый URL, рендерится легаси).
 *
 * ВАЖНО: в Next 16 (proxy-конвенция) внутренний rewrite ПОВТОРНО проходит через proxy
 * (в отличие от старого middleware). Без защиты это давало петлю:
 * schedule →(rewrite)→ calendar →(re-entry)→ legacyRedirect → 308 schedule → ∞.
 * Защита — маркер `REWRITE_MARKER_HEADER` в заголовках переписанного запроса:
 * на повторном входе функция сразу возвращает null.
 */
/**
 * Маркер внутреннего rewrite. В Next 16 (proxy-конвенция) внутренний
 * `NextResponse.rewrite` ПОВТОРНО проходит через proxy — в отличие от старого
 * middleware. Без защиты возникает петля: schedule →(rewrite)→ calendar →(re-entry)→
 * legacyRedirect → 308 schedule → ∞. Маркер прокидывается в заголовки переписанного
 * запроса и на повторном входе заставляет нас сразу выйти.
 */
const REWRITE_MARKER_HEADER = "x-bc-doctor-rewrite";

export function doctorRouteRedirectResponse(
  request: NextRequest,
): NextResponse | null {
  const { pathname } = request.nextUrl;

  // Повторный вход после внутреннего rewrite — пропускаем всю логику, петли нет.
  if (request.headers.get(REWRITE_MARKER_HEADER) === "1") return null;

  // Хелпер: rewrite с маркером в заголовках переписанного запроса.
  const rewriteWithMarker = (url: URL): NextResponse => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(REWRITE_MARKER_HEADER, "1");
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  };

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
    "/app/doctor/broadcasts/archive": "/app/doctor/communications?tab=broadcasts&archive=1",
    "/app/doctor/broadcasts": "/app/doctor/communications?tab=broadcasts",
    "/app/doctor/appointments": "/app/doctor/schedule?tab=calendar",
    "/app/doctor/calendar": "/app/doctor/schedule?tab=calendar",
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

  // ── Internal rewrites: new aggregate URLs → legacy pages ──────────────────
  // NextResponse.rewrite не вызывает повторный проход middleware, петли нет.

  if (pathname === "/app/doctor/schedule") {
    const tab = request.nextUrl.searchParams.get("tab") ?? "calendar";
    const url = request.nextUrl.clone();
    url.search = "";
    url.pathname = tab === "setup" ? "/app/doctor/admin/booking" : "/app/doctor/calendar";
    return rewriteWithMarker(url);
  }

  if (pathname === "/app/doctor/communications") {
    const tab = request.nextUrl.searchParams.get("tab") ?? "chats";
    const url = request.nextUrl.clone();
    url.search = "";

    if (tab === "intake") {
      const id = request.nextUrl.searchParams.get("id");
      url.pathname = id ? `/app/doctor/online-intake/${id}` : "/app/doctor/online-intake";
    } else if (tab === "broadcasts") {
      url.pathname =
        request.nextUrl.searchParams.get("archive") === "1"
          ? "/app/doctor/broadcasts/archive"
          : "/app/doctor/broadcasts";
    } else {
      // chats, comments, or unknown default
      url.pathname = "/app/doctor/messages";
    }

    return rewriteWithMarker(url);
  }

  return null;
}
