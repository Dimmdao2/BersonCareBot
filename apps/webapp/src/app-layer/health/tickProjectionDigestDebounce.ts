import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { probeProjectionDigestSignal } from "@/app-layer/health/probeProjectionDigestSignal";
import {
  runProjectionDigestDebounceTick,
  type ProjectionDigestDebounceFlags,
} from "@/modules/operator-health/runProjectionDigestDebounceTick";
import { getConfigValue } from "@/modules/system-settings/configAdapter";

export type { ProjectionDigestDebounceFlags };

/**
 * Обновляет debounce projection для суточной сводки на каждом hourly digest tick
 * (включая `not_slot`), чтобы 15‑мин устойчивость отслеживалась в prod.
 */
export async function tickProjectionDigestDebounce(nowMs = Date.now()): Promise<ProjectionDigestDebounceFlags> {
  const deps = buildAppDeps();
  return runProjectionDigestDebounceTick({
    operatorHealthRead: deps.operatorHealthRead,
    operatorHealthWrite: deps.operatorHealthWrite,
    getConfigValue,
    fetchSignal: probeProjectionDigestSignal,
    nowMs,
  });
}
