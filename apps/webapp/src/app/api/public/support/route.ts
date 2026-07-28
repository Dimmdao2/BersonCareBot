/**
 * POST /api/public/support — обращение в поддержку без сессии (экран входа).
 * Rate limit по IP.
 *
 * D-2 (night plan 2026-07-26): no longer Telegram-only / no longer 503s when Telegram is
 * unconfigured. Delivery goes through `relaySupportSubmission` → `dispatchOperatorAlert`, the
 * existing multi-channel (telegram/max/web_push/sms), config-driven operator-alert mechanism —
 * the same one `/api/patient/support` now uses. A submission is never lost: if no channel
 * confirms delivery it is persisted for the operator to recover.
 */

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { logger } from '@/app-layer/logging/logger';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import { relaySupportSubmission } from '@/app-layer/support/relaySupportSubmission';

const RATE_LIMIT_MS = 60_000;
const lastPublicSupportByKey = new Map<string, number>();

const MAX_MESSAGE_LEN = 4000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function sanitizeFromAppPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().slice(0, 200);
  if (!t.startsWith('/app')) return null;
  if (/[\r\n\0]/.test(t)) return null;
  return t;
}

function publicSupportRateKey(h: Headers): string {
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || '';
  return ip ? `pub:${ip}` : 'pub:anon';
}

function buildGuestSupportLines(params: {
  email: string;
  message: string;
  userAgent: string;
  surface: string;
  fromPath: string | null;
}): string[] {
  return [
    'Поддержка (webapp) — гость, не авторизован',
    `Email: ${params.email}`,
    `Поверхность: ${params.surface}`,
    params.fromPath ? `Страница: ${params.fromPath}` : null,
    `User-Agent: ${params.userAgent || '—'}`,
    '',
    'Сообщение:',
    params.message,
  ].filter((x): x is string => x != null);
}

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/public/support:POST', request);
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    message?: string;
    surface?: string;
    from?: string;
  } | null;

  const email = normalizeEmail(typeof body?.email === 'string' ? body.email : '');
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: 'invalid_email', message: 'Укажите корректный email' },
      { status: 400 },
    );
  }

  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_message',
        message: `Введите текст сообщения (до ${MAX_MESSAGE_LEN} символов)`,
      },
      { status: 400 },
    );
  }

  const surfaceRaw = typeof body?.surface === 'string' ? body.surface.trim().toLowerCase() : '';
  const surface =
    surfaceRaw === 'mini_app' ? 'mini_app' : surfaceRaw === 'browser' ? 'browser' : 'unknown';

  const fromPath = sanitizeFromAppPath(body?.from) ?? routePaths.loginContactSupport;

  const h = await headers();
  const userAgent = (h.get('user-agent') ?? '').slice(0, 500);
  const rateKey = publicSupportRateKey(h);

  const now = Date.now();
  const prev = lastPublicSupportByKey.get(rateKey);
  if (prev !== undefined && now - prev < RATE_LIMIT_MS) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const lines = buildGuestSupportLines({
    email,
    message,
    userAgent,
    surface,
    fromPath,
  });

  // D-2: emit via the operator-alert relay (multi-channel, config-driven) instead of a raw
  // Telegram-only call; never lost — see relaySupportSubmission for the fallback contract.
  const messageId = `support:public:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const result = await relaySupportSubmission({
    kind: 'guest',
    messageId,
    lines,
    email,
    message,
    fromPath,
  });

  lastPublicSupportByKey.set(rateKey, Date.now());

  if (!result.delivered) {
    logger.warn(
      { route: 'public/support', persisted: result.persisted },
      '[public/support] no channel confirmed delivery',
    );
    return NextResponse.json({
      ok: true,
      delivered: false,
      message: 'Сообщение получено. Ответим, как только сможем.',
    });
  }

  return NextResponse.json({ ok: true, delivered: true, message: 'Сообщение отправлено' });
}
