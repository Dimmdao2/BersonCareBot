import fetch from 'node-fetch';
import { env } from '../../config/env.js';

type TgOkResponse<T> = { ok: true; result: T };
type TgErrResponse = { ok: false; description?: string };

function getTelegramFetch(): typeof fetch {
  const g = process as unknown as { __TELEGRAM_FETCH_MOCK__?: typeof fetch };
  return g.__TELEGRAM_FETCH_MOCK__ ?? fetch;
}

export async function tgCall<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const token = env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN is not set');

  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await getTelegramFetch()(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = (await res.json()) as TgOkResponse<T> | TgErrResponse;
  if (!data.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  }
  return data.result;
}
