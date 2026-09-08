import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAccountWebPushSelfApiSession } from '@/app-layer/guards/requireRole';
import { createNativePushTokenCipherFromEnv, isNativePushProvider } from '@/modules/web-push/nativePush';
import { createPgNativePushTargetsPort } from '@/infra/repos/pgNativePushTargets';
const registration = z.object({ installationId: z.string().min(8).max(512), token: z.string().min(8).max(8192), provider: z.enum(['rustore', 'fcm', 'hms']) }); const port = () => createPgNativePushTargetsPort(createNativePushTokenCipherFromEnv());
/** Account route fixes Therapysto and retains the existing staff second-factor boundary. */
export async function GET() { const gate = await requireAccountWebPushSelfApiSession(); if (!gate.ok) return gate.response; return NextResponse.json({ ok: true, ...(await port().status(gate.session.user.userId, 'therapysto')) }); }
export async function POST(request: Request) { const gate = await requireAccountWebPushSelfApiSession(); if (!gate.ok) return gate.response; const parsed = registration.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }); await port().register({ userId: gate.session.user.userId, appId: 'therapysto', ...parsed.data }); return NextResponse.json({ ok: true }); }
export async function DELETE(request: Request) { const gate = await requireAccountWebPushSelfApiSession(); if (!gate.ok) return gate.response; const body = await request.json().catch(() => null) as Record<string, unknown> | null; if (!body || typeof body.installationId !== 'string' || !isNativePushProvider(body.provider)) return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }); await port().revoke(gate.session.user.userId, 'therapysto', body.provider, body.installationId); return NextResponse.json({ ok: true }); }
