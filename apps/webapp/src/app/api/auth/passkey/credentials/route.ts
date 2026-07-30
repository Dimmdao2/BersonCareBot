import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiSession } from '@/app-layer/guards/requireRole';
import { pgPasskeyStore } from '@/infra/repos/pgPasskeyStore';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';

const deleteSchema = z.object({ credentialId: z.string().min(16).max(1024) });

async function authorize() {
  const gate = await requirePatientApiSession();
  if (!gate.ok) return gate;
  if (!(await isIndependentAuthMethodEnabled('passkey'))) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: 'auth_method_disabled', message: 'Вход по ключу доступа отключён' },
        { status: 403 },
      ),
    };
  }
  return gate;
}

export async function GET() {
  const gate = await authorize();
  if (!gate.ok) return gate.response;
  const credentials = await pgPasskeyStore.listCredentials(gate.session.user.userId);
  return NextResponse.json({ ok: true, credentials });
}

export async function DELETE(request: Request) {
  const gate = await authorize();
  if (!gate.ok) return gate.response;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const deleted = await pgPasskeyStore.deleteCredential(
    gate.session.user.userId,
    parsed.data.credentialId,
  );
  return deleted
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
}
