import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';

const INVALID_INTENT_SENTINEL = '00000000-0000-4000-8000-000000000000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Отдельная самостоятельная страница, а не экран приложения: сюда приходят из мессенджера, без
 * сессии и часто по плохой связи. Ни оболочки кабинета, ни клиентского кода здесь нет намеренно.
 *
 * Сумма здесь не печатается СОЗНАТЕЛЬНО. Живой счёт уходит редиректом и эту страницу не видит, а на
 * мёртвом счёте сумма пациенту не нужна — платить нечего. Зато она делала ответы различимыми:
 * настоящий мёртвый счёт печатал сумму, а неизвестный и битый идентификатор — нет (независимый
 * аудит S3 замерил тела 1110 против 1077 байт). Тот, кто держит чужую ссылку, узнавал так, что
 * счёт существует, и его цену. Три ответа обязаны быть одинаковыми.
 */
function page(input: { state: string; note: string }): string {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Оплата записи</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f5f2;color:#201b18;font:16px/1.5 system-ui,sans-serif;padding:24px}.card{width:min(100%,520px);background:#fff;border:1px solid #e5ded7;border-radius:20px;padding:32px;box-shadow:0 16px 44px rgba(55,39,29,.08)}h1{font-size:clamp(24px,6vw,34px);line-height:1.15;margin:0 0 12px}.state{color:#a12622;font-weight:650;margin:0}.details{color:#655b54;margin:8px 0 0}
</style></head><body><main class="card"><h1>Оплата записи</h1><p class="state">${input.state}</p><p class="details">${input.note}</p></main></body></html>`;
}

function respond(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ intentId: string }> },
): Promise<Response> {
  stampBootstrapPrincipal('book/pay/[intentId]:GET', request);
  const { intentId: rawIntentId } = await context.params;
  const intentId = UUID_RE.test(rawIntentId) ? rawIntentId : INVALID_INTENT_SENTINEL;

  let check;
  try {
    const payments = buildAppDeps().payments;
    if (!payments) throw new Error('payments_unavailable');
    check = await payments.readAppointmentPaymentCheck(intentId);
  } catch (cause) {
    // «Не смогли проверить» и «счёт мёртв» — РАЗНЫЕ вещи, и объединять их нельзя: сказать человеку
    // «бронирование отменено» из-за нашего сбоя значит соврать про его живую бронь и, скорее всего,
    // потерять её по-настоящему — он перестанет платить.
    logger.error({ err: cause }, '[book/pay] invoice check failed');
    return respond(
      503,
      page({
        state: 'Не удалось проверить счёт',
        note: 'Это сбой на нашей стороне, а не отказ в оплате. Обновите страницу через минуту.',
      }),
    );
  }

  if (check?.alive && check.providerCheckoutUrl) {
    const target = new URL(check.providerCheckoutUrl);
    if (target.protocol === 'https:' || target.protocol === 'http:') {
      return new Response(null, {
        status: 307,
        headers: { Location: target.toString(), 'Cache-Control': 'no-store' },
      });
    }
  }

  // Срок здесь намеренно не печатается: у корня нет часового пояса клиники, а показать дедлайн в
  // чужом поясе хуже, чем не показать его вовсе — это деньги, и час разницы меняет смысл.
  return respond(
    410,
    page({
      state: 'Оплата не поступила, бронирование отменено',
      note: 'Время этой брони вышло. Чтобы записаться заново, откройте запись в кабинете.',
    }),
  );
}
