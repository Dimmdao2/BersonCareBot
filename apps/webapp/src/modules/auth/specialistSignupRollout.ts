import { getPublicRuntimeBool } from "@/modules/system-settings/configAdapter";

/** Public specialist self-signup rollout flag. Safe default is disabled until cutover. */
export async function getSpecialistSignupEnabled(): Promise<boolean> {
  return getPublicRuntimeBool("specialist_signup_enabled");
}
