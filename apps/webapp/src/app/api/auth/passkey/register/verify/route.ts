import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { finishSelfPasskeyRegistration } from '@/app-layer/auth/passkeyRuntime';
import { requireAuthenticatedIdentitySelfApiSession } from '@/app-layer/guards/requireRole';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';

const responseSchema = z
  .object({
    id: z.string().min(16).max(1024),
    rawId: z.string().min(16).max(1024),
    type: z.literal('public-key'),
    response: z
      .object({
        clientDataJSON: z.string().min(16),
        attestationObject: z.string().min(16),
        transports: z.array(z.string()).optional(),
      })
      .passthrough(),
    clientExtensionResults: z.record(z.string(), z.unknown()),
    authenticatorAttachment: z.string().nullable().optional(),
  })
  .passthrough();

const bodySchema = z.object({
  challengeId: z.uuid(),
  response: responseSchema,
});

export async function POST(request: Request) {
  const gate = await requireAuthenticatedIdentitySelfApiSession();
  if (!gate.ok) return gate.response;
  if (!(await isIndependentAuthMethodEnabled('passkey'))) {
    return NextResponse.json(
      { ok: false, error: 'auth_method_disabled', message: 'Вход по ключу доступа отключён' },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  try {
    const completed = await finishSelfPasskeyRegistration({
      userId: gate.session.user.userId,
      challengeId: parsed.data.challengeId,
      response: parsed.data.response as RegistrationResponseJSON,
    });
    if (!completed) {
      return NextResponse.json(
        { ok: false, error: 'passkey_verification_failed' },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'passkey_verification_failed' }, { status: 400 });
  }
}
