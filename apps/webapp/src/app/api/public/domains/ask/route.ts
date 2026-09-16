import { handleOnDemandTlsAskRequest } from '@/app-layer/surface/onDemandTlsAskRequest';

/** Public Caddy on-demand TLS permission contract. Единственный адрес этой двери. */
export async function GET(request: Request) {
  return handleOnDemandTlsAskRequest(request);
}
