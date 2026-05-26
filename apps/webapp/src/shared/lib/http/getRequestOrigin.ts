/**
 * Origin текущего HTTP-запроса (учёт reverse proxy).
 * Для редиректов после auth/logout — не уводить на другой host (localhost vs 127.0.0.1).
 */
export function getRequestOrigin(request: Request, requestUrl?: URL): string {
  const url = requestUrl ?? new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || url.host;
  const protocol = forwardedProto || url.protocol.replace(/:$/, "");
  return `${protocol}://${host}`;
}
