import type { IntegratorPushOutboxHealthSnapshot } from "./ports";

/** Порог due-backlog (аналог исходящей доставки). */
export const ADMIN_INTEGRATOR_PUSH_OUTBOX_DUE_WARNING = 50;

/** Due-pending старше — degraded (сек). */
export const ADMIN_INTEGRATOR_PUSH_OUTBOX_OLDEST_DUE_DEGRADED_SEC = 15 * 60;
/** Due-pending старше — error при ненулевом backlog (сек). */
export const ADMIN_INTEGRATOR_PUSH_OUTBOX_OLDEST_DUE_ERROR_SEC = 60 * 60;

/** «Зависший» processing: degraded (сек с min(updated_at)). */
export const ADMIN_INTEGRATOR_PUSH_OUTBOX_PROCESSING_STALE_DEGRADED_SEC = 10 * 60;
export const ADMIN_INTEGRATOR_PUSH_OUTBOX_PROCESSING_STALE_ERROR_SEC = 45 * 60;

/**
 * Агрегированный статус очереди `integrator_push_outbox` для system-health и баннера врача.
 */
export function classifyIntegratorPushOutboxSystemHealthStatus(
  s: IntegratorPushOutboxHealthSnapshot,
): "ok" | "degraded" | "error" {
  let rank = 0;
  const bump = (to: number) => {
    if (to > rank) rank = to;
  };

  if (s.deadTotal > 0) {
    bump(2);
  }

  if (s.dueBacklog >= ADMIN_INTEGRATOR_PUSH_OUTBOX_DUE_WARNING) {
    bump(1);
  }

  if (s.dueBacklog > 0) {
    const age = s.oldestDueAgeSeconds ?? 0;
    if (age >= ADMIN_INTEGRATOR_PUSH_OUTBOX_OLDEST_DUE_ERROR_SEC) bump(2);
    else if (age >= ADMIN_INTEGRATOR_PUSH_OUTBOX_OLDEST_DUE_DEGRADED_SEC) bump(1);
  }

  if (s.processingCount > 0) {
    const pAge = s.oldestProcessingAgeSeconds ?? 0;
    if (pAge >= ADMIN_INTEGRATOR_PUSH_OUTBOX_PROCESSING_STALE_ERROR_SEC) bump(2);
    else if (pAge >= ADMIN_INTEGRATOR_PUSH_OUTBOX_PROCESSING_STALE_DEGRADED_SEC) bump(1);
  }

  if (rank >= 2) return "error";
  if (rank >= 1) return "degraded";
  return "ok";
}
