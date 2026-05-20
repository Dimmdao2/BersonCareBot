import { FRESH_LOGIN_COOKIE_NAME } from "@/modules/auth/sessionCookieNames";

export const FRESH_LOGIN_STORAGE_KEY = "bersoncare_fresh_login";

function writeFreshLoginDocumentCookie(): void {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${FRESH_LOGIN_COOKIE_NAME}=1; Path=/; Max-Age=120; SameSite=Lax${secure}`;
}

function clearFreshLoginDocumentCookie(): void {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${FRESH_LOGIN_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function readFreshLoginDocumentCookie(): boolean {
  const escaped = FRESH_LOGIN_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match?.[1] === "1";
}

export function markFreshLoginAfterAuth(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FRESH_LOGIN_STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
  writeFreshLoginDocumentCookie();
}

export function consumeFreshLoginFlag(): boolean {
  if (typeof window === "undefined") return false;

  let fromStorage = false;
  try {
    const raw = sessionStorage.getItem(FRESH_LOGIN_STORAGE_KEY);
    sessionStorage.removeItem(FRESH_LOGIN_STORAGE_KEY);
    fromStorage = raw === "1";
  } catch {
    /* private mode */
  }

  let fromCookie = false;
  try {
    fromCookie = readFreshLoginDocumentCookie();
    if (fromCookie) clearFreshLoginDocumentCookie();
  } catch {
    /* ignore */
  }

  return fromStorage || fromCookie;
}
