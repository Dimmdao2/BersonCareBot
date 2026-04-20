"use client";

import { hasBusyOperations } from "@/shared/lib/busyRegistry";
import { isReloadDeniedPath } from "@/shared/lib/reloadDenylist";
import {
  AUTO_RELOAD_ENABLED,
  RELOAD_COOLDOWN_MS,
  RELOAD_DEFER_TIMEOUT_MS,
  RELOAD_LOCK_TTL_MS,
  RELOAD_MAX_COUNT,
  RELOAD_PENDING_LOCK_KEY,
  RELOAD_RECHECK_DELAY_MS,
  RELOAD_STATE_KEY,
  RELOAD_WINDOW_MS,
} from "@/shared/lib/reloadConstants";

type ReloadReason = "version-mismatch" | "stale-server-action";

type ReloadState = {
  lastReloadAt: number;
  count: number;
  windowStartedAt: number;
  lastBuildId: string;
};

type ReloadLock = {
  takenAt: number;
  tabId: string;
};

type DeferredState = {
  timerId: number;
  cleanup: () => void;
};

let deferredState: DeferredState | null = null;

function log(message: string, extra?: unknown): void {
  if (extra === undefined) {
    console.info(`[bcb-reload] ${message}`);
    return;
  }
  console.info(`[bcb-reload] ${message}`, extra);
}

function warn(message: string, extra?: unknown): void {
  if (extra === undefined) {
    console.warn(`[bcb-reload] ${message}`);
    return;
  }
  console.warn(`[bcb-reload] ${message}`, extra);
}

function readJsonStorage<T>(storage: Storage, key: string): T | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

function getTabId(): string | null {
  try {
    const existing = sessionStorage.getItem("bcb:reload:tab-id");
    if (existing) return existing;
    const created = `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem("bcb:reload:tab-id", created);
    return created;
  } catch {
    return null;
  }
}

function getCurrentBuildId(): string {
  if (typeof document === "undefined") return "";
  const meta = document.querySelector('meta[name="x-build-id"]');
  const value = meta?.getAttribute("content");
  return value?.trim() || "";
}

function hasActiveInput(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return true;
  }
  return active.getAttribute("contenteditable") === "true";
}

function canReloadNow(pathname: string): string | null {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return "not-in-browser";
  }
  if (document.visibilityState !== "visible") return "tab-hidden";
  if (isReloadDeniedPath(pathname)) return "denylist-path";
  if (hasActiveInput()) return "active-input";
  if (hasBusyOperations()) return "busy-operations";
  return null;
}

function getReloadState(now: number): ReloadState | null {
  try {
    const state = readJsonStorage<ReloadState>(sessionStorage, RELOAD_STATE_KEY);
    if (!state) {
      return {
        lastReloadAt: 0,
        count: 0,
        windowStartedAt: now,
        lastBuildId: "",
      };
    }
    if (now - state.windowStartedAt > RELOAD_WINDOW_MS) {
      return {
        lastReloadAt: state.lastReloadAt,
        count: 0,
        windowStartedAt: now,
        lastBuildId: state.lastBuildId,
      };
    }
    return state;
  } catch {
    return null;
  }
}

function saveReloadState(state: ReloadState): boolean {
  try {
    sessionStorage.setItem(RELOAD_STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function acquireLock(now: number, tabId: string): { ok: boolean; reason?: string } {
  try {
    const current = readJsonStorage<ReloadLock>(localStorage, RELOAD_PENDING_LOCK_KEY);
    if (current && now - current.takenAt < RELOAD_LOCK_TTL_MS && current.tabId !== tabId) {
      return { ok: false, reason: "locked-by-other-tab" };
    }
    const next: ReloadLock = { takenAt: now, tabId };
    localStorage.setItem(RELOAD_PENDING_LOCK_KEY, JSON.stringify(next));
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage-unavailable" };
  }
}

function scheduleDeferred(reason: ReloadReason, desiredBuildId?: string): void {
  if (deferredState) {
    return;
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const recheck = () => {
    void safeReload(reason, desiredBuildId);
  };
  const onEvent = () => {
    cleanup();
    recheck();
  };
  const cleanup = () => {
    if (!deferredState) return;
    window.removeEventListener("focus", onEvent);
    window.removeEventListener("pointerup", onEvent);
    window.removeEventListener("visibilitychange", onEvent);
    window.clearTimeout(deferredState.timerId);
    deferredState = null;
  };

  window.addEventListener("focus", onEvent, { once: true });
  window.addEventListener("pointerup", onEvent, { once: true });
  window.addEventListener("visibilitychange", onEvent, { once: true });
  const timerId = window.setTimeout(() => cleanup(), RELOAD_DEFER_TIMEOUT_MS);
  deferredState = { timerId, cleanup };
}

function releaseDeferredListeners(): void {
  deferredState?.cleanup();
}

export function __resetSafeReloadForTests(): void {
  releaseDeferredListeners();
}

export async function safeReload(reason: ReloadReason, desiredBuildId?: string): Promise<boolean> {
  if (!AUTO_RELOAD_ENABLED) {
    return false;
  }
  if (typeof window === "undefined") {
    return false;
  }

  const now = Date.now();
  const tabId = getTabId();
  if (!tabId) {
    warn("deferred:storage-unavailable", { reason });
    return false;
  }

  const currentPath = window.location.pathname;
  const deferReason = canReloadNow(currentPath);
  if (deferReason) {
    log(`deferred:${deferReason}`, { reason, path: currentPath });
    scheduleDeferred(reason, desiredBuildId);
    return false;
  }

  const state = getReloadState(now);
  if (!state) {
    warn("deferred:storage-unavailable", { reason });
    return false;
  }

  if (now - state.lastReloadAt < RELOAD_COOLDOWN_MS) {
    log("deferred:cooldown", { reason });
    scheduleDeferred(reason, desiredBuildId);
    return false;
  }

  if (state.count >= RELOAD_MAX_COUNT) {
    warn("loop-break:max-count", { reason });
    return false;
  }

  const currentBuildId = getCurrentBuildId();
  if (state.lastBuildId && currentBuildId && state.lastBuildId === currentBuildId) {
    warn("loop-break:same-build-id", { reason, buildId: currentBuildId });
    return false;
  }

  const lock = acquireLock(now, tabId);
  if (!lock.ok) {
    if (lock.reason === "locked-by-other-tab") {
      log("deferred:locked-by-other-tab", { reason });
      window.setTimeout(() => {
        void safeReload(reason, desiredBuildId);
      }, RELOAD_RECHECK_DELAY_MS);
      return false;
    }
    warn("deferred:storage-unavailable", { reason });
    return false;
  }

  const nextState: ReloadState = {
    lastReloadAt: now,
    count: state.count + 1,
    windowStartedAt: state.windowStartedAt || now,
    lastBuildId: desiredBuildId || currentBuildId,
  };
  if (!saveReloadState(nextState)) {
    warn("deferred:storage-unavailable", { reason });
    return false;
  }

  releaseDeferredListeners();

  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(now));
  log("reloaded", { reason, buildId: desiredBuildId || currentBuildId });
  window.location.replace(url.toString());
  return true;
}
