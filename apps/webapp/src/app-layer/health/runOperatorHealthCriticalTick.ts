import { collectCriticalHealthSignals } from "@/app-layer/health/collectCriticalHealthSignals";
import { classifyCriticalHealthSignals } from "@/modules/operator-health/criticalHealthSignals";
import { dispatchOperatorAlert } from "@/modules/operator-alerts/dispatchOperatorAlert";

/**
 * Critical tick: classify матрицы §3 → `dispatchOperatorAlert` (block critical).
 */
export async function runOperatorHealthCriticalTick(): Promise<{ alerted: number; keys: string[] }> {
  const input = await collectCriticalHealthSignals();
  const candidates = classifyCriticalHealthSignals(input);
  const keys: string[] = [];
  let alerted = 0;

  for (const c of candidates) {
    const result = await dispatchOperatorAlert({
      block: "critical",
      topic: c.topic,
      dedupKey: c.dedupKey,
      lines: c.lines,
      pushTitle: c.pushTitle,
      pushUrl: "/app/doctor/system-health",
    });
    if (result.dispatched) {
      alerted += 1;
      keys.push(c.dedupKey);
    }
  }

  return { alerted, keys };
}
