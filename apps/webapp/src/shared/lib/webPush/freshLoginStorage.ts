export const FRESH_LOGIN_STORAGE_KEY = "bersoncare_fresh_login";

export function markFreshLoginAfterAuth(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FRESH_LOGIN_STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function consumeFreshLoginFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(FRESH_LOGIN_STORAGE_KEY);
    sessionStorage.removeItem(FRESH_LOGIN_STORAGE_KEY);
    return raw === "1";
  } catch {
    return false;
  }
}

export function peekFreshLoginFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(FRESH_LOGIN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
