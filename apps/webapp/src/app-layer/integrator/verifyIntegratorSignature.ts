import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { verifyIntegratorSignature as verifySignature } from '@/infra/webhooks/verifyIntegratorSignature';

/** App-layer boundary: establishes bounded request context before verifying integrator POST HMAC. */
export function verifyIntegratorSignature(
  timestamp: string | null,
  rawBody: string,
  signature: string | null,
  request?: Request,
): boolean {
  if (request) stampBootstrapPrincipal('api/integrator:POST', request);
  if (!timestamp || !signature) return false;
  return verifySignature(timestamp, rawBody, signature);
}
