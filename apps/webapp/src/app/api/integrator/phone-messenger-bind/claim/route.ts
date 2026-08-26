import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { ensureSystemSettingsConfigAdapterBound } from '@/app-layer/di/bindSystemSettingsConfigAdapter';
import { verifyIntegratorSignature } from '@/app-layer/integrator/verifyIntegratorSignature';
import { claimPhoneMessengerBindFromIntegrator } from '@/modules/auth/phoneMessengerBind';
import { isAuthChannelEnabled } from '@/modules/auth/authChannelPolicy';

const bodySchema = z.object({
  setupToken: z.string().min(4).max(500),
  channelCode: z.enum(['telegram', 'max']),
  externalId: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  ensureSystemSettingsConfigAdapterBound();
  buildAppDeps();
  const timestamp = request.headers.get('x-bersoncare-timestamp');
  const signature = request.headers.get('x-bersoncare-signature');
  const rawBody = await request.text();
  if (!timestamp || !signature) {
    return NextResponse.json({ ok: false, error: 'missing webhook headers' }, { status: 400 });
  }
  if (!verifyIntegratorSignature(timestamp, rawBody, signature, request)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'validation_error' }, { status: 400 });
  // Patient-only route (M2M from integrator) — see the same explicit-surface note in
  // messenger-bind/start/route.ts.
  if (!(await isAuthChannelEnabled(parsed.data.channelCode, 'patient'))) {
    return NextResponse.json({ ok: false, error: 'auth_channel_disabled' }, { status: 403 });
  }
  const result = await claimPhoneMessengerBindFromIntegrator(parsed.data);
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: result.code }, { status: 400 });
}
