import { NextResponse } from 'next/server';
import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { consumeLoginSecurityAction } from '@/infra/loginSecurityAction';
import { relaySupportSubmission } from '@/app-layer/support/relaySupportSubmission';
import { logger } from '@/app-layer/logging/logger';
import { routePaths } from '@/app-layer/routes/paths';

const bodySchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/public/account-protection:POST', request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }

  try {
    const consumed = await consumeLoginSecurityAction(parsed.data.key);
    if (consumed.outcome !== 'consumed') {
      return NextResponse.json(
        { ok: false, reason: consumed.outcome },
        { status: consumed.outcome === 'expired' ? 410 : 409 },
      );
    }

    const message =
      'Человек подтвердил, что вход с нового устройства был не его. Все входы завершены, при следующем входе потребуется новый пароль.';
    await relaySupportSubmission({
      kind: 'guest',
      messageId: `support:account-protection:${consumed.sourceLoginEventId}`,
      lines: [
        'Защита учётной записи — вход с нового устройства',
        `Пользователь: ${consumed.userId}`,
        `Запись входа: ${consumed.sourceLoginEventId}`,
        '',
        message,
      ],
      email: consumed.email ?? '',
      message,
      userId: consumed.userId,
      fromPath: routePaths.accountProtection,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, '[account-protection] action failed');
    return NextResponse.json({ ok: false, reason: 'failed' }, { status: 500 });
  }
}
