import { getPublicRuntimeBool } from "@/modules/system-settings/configAdapter";

/** Global public rollout flag. Missing/denied projection always remains disabled. */
export function getUnsupportedClientFallbackEnabled(): Promise<boolean> {
  return getPublicRuntimeBool("patient_unsupported_client_fallback_enabled", "public_auth_config");
}
