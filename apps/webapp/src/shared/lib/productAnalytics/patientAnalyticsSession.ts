const SESSION_ID_KEY = "bersoncare_analytics_client_session_id";
const SESSION_LAST_KEY = "bersoncare_analytics_client_session_last";
const APP_OPEN_SENT_KEY = "bersoncare_analytics_app_open_sent";

export const CLIENT_SESSION_IDLE_MS = 30 * 60 * 1000;
export const PAGE_VIEW_DEBOUNCE_MS = 30 * 1000;
export const HEARTBEAT_INTERVAL_MS = 60 * 1000;

function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** UUID сессии клиента; ротация после 30 мин без активности. */
export function getOrRotateClientSessionId(now = Date.now()): string {
  if (typeof sessionStorage === "undefined") return newSessionId();

  const lastRaw = sessionStorage.getItem(SESSION_LAST_KEY);
  const last = lastRaw ? Number.parseInt(lastRaw, 10) : 0;
  let id = sessionStorage.getItem(SESSION_ID_KEY);

  if (!id || !Number.isFinite(last) || now - last > CLIENT_SESSION_IDLE_MS) {
    id = newSessionId();
    sessionStorage.setItem(SESSION_ID_KEY, id);
    sessionStorage.removeItem(APP_OPEN_SENT_KEY);
  }

  sessionStorage.setItem(SESSION_LAST_KEY, String(now));
  return id;
}

export function touchClientSessionActivity(now = Date.now()): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_LAST_KEY, String(now));
}

export function markAppOpenSent(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(APP_OPEN_SENT_KEY, "1");
}

export function wasAppOpenSent(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(APP_OPEN_SENT_KEY) === "1";
}

const pageViewKey = (pageKey: string) => `bersoncare_analytics_pv_${pageKey}`;

export function shouldSendPageView(pageKey: string, now = Date.now()): boolean {
  if (typeof sessionStorage === "undefined") return true;
  const raw = sessionStorage.getItem(pageViewKey(pageKey));
  const last = raw ? Number.parseInt(raw, 10) : 0;
  if (Number.isFinite(last) && now - last < PAGE_VIEW_DEBOUNCE_MS) return false;
  sessionStorage.setItem(pageViewKey(pageKey), String(now));
  return true;
}
