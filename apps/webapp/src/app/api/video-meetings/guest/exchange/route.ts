import { NextResponse } from 'next/server';
import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';

const bodySchema = z.object({ bearer: z.string().min(32).max(256) }).strict();

function refusal() {
  const response = NextResponse.json({ ok: false, error: 'meeting_unavailable' }, { status: 404 });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/video-meetings/guest/exchange:POST', request);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return refusal();
  const service = buildAppDeps().videoMeetings;
  if (!service) return refusal();
  const context = await service.resolveGuestOrganization(body.data.bearer);
  if (!context) return refusal();
  const entitlement = await requireEntitlementForRead(context, 'video_meetings');
  if (!entitlement.ok) return refusal();
  const result = await service.exchangeGuest(body.data.bearer);
  if (!result.ok) return refusal();
  const response = NextResponse.json({ ok: true, join: result.join });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
