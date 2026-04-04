/**
 * Re-export canonical UTC normalizer (Stage 2). Implementation lives in integrator shared — do not fork logic.
 * @see apps/integrator/src/shared/normalizeToUtcInstant.ts
 */
export {
  normalizeToUtcInstant,
  tryNormalizeToUtcInstant,
  type TryNormalizeToUtcInstantResult,
  type NormalizeToUtcInstantFailureReason,
  NAIVE_WALL_CLOCK_REGEX,
} from "../../../integrator/src/shared/normalizeToUtcInstant.js";
