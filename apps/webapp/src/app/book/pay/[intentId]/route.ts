import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

const INVALID_INTENT_SENTINEL = '00000000-0000-4000-8000-000000000000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failureHtml(input: {
  amountMinor: number | null;
  currency: string | null;
  paymentDeadlineAt: string | null;
}): string {
  const amount =
    input.amountMinor === null
      ? ''
      : `<p class="amount">${new Intl.NumberFormat('ru-RU', {
          style: 'currency',
          currency: input.currency ?? 'RUB',
        }).format(input.amountMinor / 100)}</p>`;
  const deadline = input.paymentDeadlineAt
    ? `<p class="details">Срок оплаты: <time datetime="${input.paymentDeadlineAt}">${new Intl.DateTimeFormat(
        'ru-RU',
        {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
          timeZoneName: 'short',
        },
      ).format(new Date(input.paymentDeadlineAt))}</time></p>`
    : '';
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Оплата записи</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f5f2;color:#201b18;font:16px/1.5 system-ui,sans-serif;padding:24px}.card{width:min(100%,520px);background:#fff;border:1px solid #e5ded7;border-radius:20px;padding:32px;box-shadow:0 16px 44px rgba(55,39,29,.08)}h1{font-size:clamp(24px,6vw,34px);line-height:1.15;margin:0 0 12px}.state{color:#a12622;font-weight:650;margin:0}.amount{font-size:28px;font-weight:700;margin:24px 0 0}.details{color:#655b54;margin:8px 0 0}
</style></head><body><main class="card"><h1>Оплата записи</h1><p class="state">Оплата не поступила, бронирование отменено</p>${amount}${deadline}</main></body></html>`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ intentId: string }> },
): Promise<Response> {
  stampBootstrapPrincipal('book/pay/[intentId]:GET', request);
  const { intentId: rawIntentId } = await context.params;
  const intentId = UUID_RE.test(rawIntentId) ? rawIntentId : INVALID_INTENT_SENTINEL;
  const check = await buildAppDeps().payments?.readAppointmentPaymentCheck(intentId);

  if (check?.alive && check.providerCheckoutUrl) {
    const target = new URL(check.providerCheckoutUrl);
    if (target.protocol === 'https:' || target.protocol === 'http:') {
      return new Response(null, {
        status: 307,
        headers: { Location: target.toString(), 'Cache-Control': 'no-store' },
      });
    }
  }

  return new Response(
    failureHtml({
      amountMinor: check?.amountMinor ?? null,
      currency: check?.currency ?? null,
      paymentDeadlineAt: check?.paymentDeadlineAt ?? null,
    }),
    {
      status: 410,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
