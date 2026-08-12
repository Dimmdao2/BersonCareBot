import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { isChannelLinkStartRateLimited } from '@/modules/auth/channelLinkStartRateLimit';
import { getCurrentSession } from '@/modules/auth/service';
import { startChannelLink } from '@/modules/auth/channelLink';
import { getMaxLoginBotNickname } from '@/modules/system-settings/maxLoginBotNickname';
import { getTelegramLoginBotUsername } from '@/modules/system-settings/telegramLoginBotUsername';
import { isAuthChannelEnabled } from '@/modules/auth/authChannelPolicy';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';

const bodySchema = z.object({
  channelCode: z.enum(['telegram', 'max', 'vk']),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/channel-link/start:POST', request);
  ensureAuthModulePortsBound();

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const json = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'validation_error' }, { status: 400 });
  }

  if (parsed.data.channelCode !== 'vk' && !(await isAuthChannelEnabled(parsed.data.channelCode))) {
    return NextResponse.json({ ok: false, error: 'auth_channel_disabled' }, { status: 403 });
  }

  const uid = session.user.userId?.trim();
  if (uid && (await isChannelLinkStartRateLimited(uid))) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited', message: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429 },
    );
  }

  const [botUsername, maxBotNickname] = await Promise.all([
    parsed.data.channelCode === 'telegram' ? getTelegramLoginBotUsername() : Promise.resolve(''),
    parsed.data.channelCode === 'max' ? getMaxLoginBotNickname() : Promise.resolve(''),
  ]);
  const result = await runWithDbInfraPrincipal(
    { source: 'api/auth/channel-link/start:POST:authenticated' },
    () => startChannelLink({
      userId: session.user.userId,
      channelCode: parsed.data.channelCode,
      botUsername,
      maxBotNickname,
    }),
  );

  if (!result.ok) {
    const status = result.code === 'unsupported_channel' ? 400 : 500;
    return NextResponse.json({ ok: false, error: result.code }, { status });
  }

  return NextResponse.json({
    ok: true,
    url: result.url,
    expiresAt: result.expiresAtIso,
    ...(result.manualCommand ? { manualCommand: result.manualCommand } : {}),
  });
}
