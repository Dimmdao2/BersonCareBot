import { NextResponse } from 'next/server';
import { CUSTOM_DOMAIN_ROUTING_PROBE_ID } from '@/modules/domain-health/domainCertificateProbe';

/** Exact, secret-free edge→nginx→webapp proof. Proxy admits only an eligible binding on this path. */
export async function GET(request: Request) {
  const host = request.headers.get('host')?.split(':')[0]?.trim().toLowerCase() ?? '';
  return NextResponse.json(
    { probe: CUSTOM_DOMAIN_ROUTING_PROBE_ID, host },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
