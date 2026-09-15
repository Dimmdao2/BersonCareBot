/**
 * «Как называется бот, чей токен сохранён» — один вопрос к интегратору, без токена в запросе.
 *
 * Имя бота нужно продукту: Telegram Login Widget принимает только username, ссылка `t.me/<имя>?start=`
 * открывает нужный чат, а `app.is_telegram_login_configured()` считает канал настроенным ровно по
 * непустому имени. Раньше его вводили руками отдельно от токена — и владелец 16.09.2026 получил в
 * проде чужого бота («там оказывается был какой то левый бот»), а код входа молча не доходил.
 * Его решение: имя брать по токену, а введённое руками — сверять с токеном.
 *
 * Токен остаётся в интеграторе: webapp сообщает только адресацию (платформенная аудитория либо
 * организация), интегратор сам читает credential и спрашивает Telegram.
 */
import { createHmac } from 'node:crypto';
import { getCurrentCorrelationIdHeader } from '@bersoncare/db-principal';
import {
  getIntegratorApiUrl,
  getIntegratorWebhookSecret,
} from '@/modules/system-settings/integrationRuntime';

export type TelegramBotIdentityTarget =
  | { scope: 'platform'; audience: 'staff' | 'patient' }
  | { scope: 'clinic'; organizationId: string };

export type TelegramBotIdentityResult =
  | { ok: true; username: string; botId: number }
  | {
      ok: false;
      /**
       * `credential_missing` — токена нет; `telegram_rejected` — Telegram не признал токен;
       * `telegram_unreachable` / `integrator_unreachable` — спросить не удалось, ответ неизвестен и
       * принимать имя на веру нельзя; `bot_without_username` — у бота нет публичного имени.
       */
      error:
        | 'credential_missing'
        | 'telegram_rejected'
        | 'telegram_unreachable'
        | 'bot_without_username'
        | 'integrator_unreachable';
    };

export async function fetchTelegramBotIdentity(
  target: TelegramBotIdentityTarget,
): Promise<TelegramBotIdentityResult> {
  const integratorUrl = (await getIntegratorApiUrl()).trim();
  const secret = (await getIntegratorWebhookSecret()).trim();
  if (!integratorUrl || !secret) return { ok: false, error: 'integrator_unreachable' };

  const rawBody = JSON.stringify(target);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('base64url');

  try {
    const response = await fetch(
      `${integratorUrl.replace(/\/$/, '')}/api/bersoncare/telegram-bot-identity`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bersoncare-Timestamp': timestamp,
          'X-Bersoncare-Signature': signature,
          ...getCurrentCorrelationIdHeader(),
        },
        body: rawBody,
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      username?: unknown;
      botId?: unknown;
      error?: unknown;
    };
    if (!response.ok) return { ok: false, error: 'integrator_unreachable' };
    if (data.ok === true && typeof data.username === 'string' && data.username.trim()) {
      return {
        ok: true,
        username: data.username.trim(),
        botId: typeof data.botId === 'number' ? data.botId : 0,
      };
    }
    const error = data.error;
    if (
      error === 'credential_missing' ||
      error === 'telegram_rejected' ||
      error === 'telegram_unreachable' ||
      error === 'bot_without_username'
    ) {
      return { ok: false, error };
    }
    return { ok: false, error: 'integrator_unreachable' };
  } catch {
    return { ok: false, error: 'integrator_unreachable' };
  }
}
