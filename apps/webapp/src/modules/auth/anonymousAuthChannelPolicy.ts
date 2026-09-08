import {
  getClientVisibleAuthChannelPolicy,
  type AuthChannelPolicy,
} from './authChannelPolicy';
import type { SurfaceAuthPolicyName } from '@/shared/lib/surface/surfaceAuthPolicy';

/**
 * Channel visibility for the RSC login render, where no user principal exists yet.
 *
 * Only public projections and boolean-only capabilities are reachable here. Credential-backed
 * admin detail lives in a separate module that this dependency graph does not import.
 */
export async function getAnonymousClientVisibleAuthChannelPolicy(
  surface?: SurfaceAuthPolicyName,
): Promise<AuthChannelPolicy> {
  return getClientVisibleAuthChannelPolicy(surface);
}
