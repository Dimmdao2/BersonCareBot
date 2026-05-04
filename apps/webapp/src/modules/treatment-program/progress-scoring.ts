import type { NormalizedTestDecision } from "./types";

/**
 * Если в JSON снимка программы у теста в `scoringConfig` заданы числовые пороги и в `raw_value` есть `score`,
 * возвращает решение; иначе `null` — клиент обязан передать `normalized_decision` явно.
 */
export function inferNormalizedDecisionFromScoring(
  scoringConfig: unknown,
  rawValue: Record<string, unknown>,
): NormalizedTestDecision | null {
  if (!scoringConfig || typeof scoringConfig !== "object") return null;
  const cfg = scoringConfig as {
    passIfGte?: unknown;
    passIfLte?: unknown;
    failIfLt?: unknown;
  };
  const score = rawValue.score;
  if (typeof score !== "number" || Number.isNaN(score)) return null;

  if (typeof cfg.passIfGte === "number" && score >= cfg.passIfGte) return "passed";
  if (typeof cfg.passIfLte === "number" && score <= cfg.passIfLte) return "failed";
  if (typeof cfg.failIfLt === "number" && score < cfg.failIfLt) return "failed";

  return null;
}

/**
 * `true`, если из `raw_value.score` при заданных порогах может быть выведен итог
 * ({@link inferNormalizedDecisionFromScoring} не всегда `null` для подходящего числа).
 * Иначе пациентский контур должен передать **`normalized_decision`** явно (Q2 / qualitative, legacy без порогов).
 */
export function scoringAllowsNumericDecisionInference(scoringConfig: unknown): boolean {
  if (!scoringConfig || typeof scoringConfig !== "object") return false;
  const cfg = scoringConfig as Record<string, unknown>;
  for (const key of ["passIfGte", "passIfLte", "failIfLt"] as const) {
    const v = cfg[key];
    if (typeof v === "number" && Number.isFinite(v)) return true;
  }
  return false;
}
