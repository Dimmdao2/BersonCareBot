const autoReloadEnv = process.env.NEXT_PUBLIC_AUTO_RELOAD_ENABLED?.trim().toLowerCase();

export const AUTO_RELOAD_ENABLED =
  autoReloadEnv === "true"
    ? true
    : autoReloadEnv === "false"
      ? false
      : process.env.NODE_ENV === "production";

export const RELOAD_COOLDOWN_MS = 120_000;
export const RELOAD_WINDOW_MS = 600_000;
export const RELOAD_MAX_COUNT = 3;
export const RELOAD_LOCK_TTL_MS = 10_000;
export const RELOAD_RECHECK_DELAY_MS = 15_000;
export const RELOAD_DEFER_TIMEOUT_MS = 30 * 60_000;

export const WATCHER_BASE_INTERVAL_MS = 60_000;
export const WATCHER_MAX_INTERVAL_MS = 10 * 60_000;
export const WATCHER_MAX_CONSECUTIVE_ERRORS = 5;

export const RELOAD_STATE_KEY = "bcb:reload";
export const RELOAD_PENDING_LOCK_KEY = "bcb:reload:pending";
export const BUILD_ID_META_NAME = "x-build-id";
