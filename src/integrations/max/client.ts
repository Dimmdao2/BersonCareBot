/**
 * MAX Platform API client. Uses globalThis.fetch (mockable in tests).
 * Docs: https://dev.max.ru/docs-api
 * Base: https://platform-api.max.ru
 */
const MAX_API_BASE = 'https://platform-api.max.ru';

export type MaxClientConfig = {
  apiKey: string;
  baseUrl?: string;
};

export type MaxBotInfo = {
  user_id: number;
  name: string;
  username?: string;
  is_bot: boolean;
  last_activity_time?: number;
};

export type MaxSendMessageParams = {
  userId: number;
  text: string;
  format?: 'markdown' | 'html';
  attachments?: Array<{
    type: 'inline_keyboard';
    payload: { buttons: Array<Array<{ type: string; text: string; payload?: string; url?: string }>> };
  }>;
};

export type MaxAnswerCallbackParams = {
  callbackId: string;
  notification?: string;
};

function authHeader(apiKey: string): Record<string, string> {
  return { Authorization: apiKey };
}

/**
 * GET /me — bot info (health/auth check).
 */
export async function getMaxBotInfo(config: MaxClientConfig): Promise<MaxBotInfo | null> {
  const base = config.baseUrl ?? MAX_API_BASE;
  const res = await globalThis.fetch(`${base}/me`, {
    method: 'GET',
    headers: { ...authHeader(config.apiKey), 'Content-Type': 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as MaxBotInfo;
  return data?.user_id != null ? data : null;
}

/**
 * POST /messages?user_id={userId} — send message to user. Inline keyboard via attachments.
 */
export async function sendMaxMessage(config: MaxClientConfig, params: MaxSendMessageParams): Promise<{ message?: { id: number } } | null> {
  const base = config.baseUrl ?? MAX_API_BASE;
  const url = new URL(`${base}/messages`);
  url.searchParams.set('user_id', String(params.userId));
  const body: Record<string, unknown> = {
    text: params.text,
    ...(params.format ? { format: params.format } : {}),
    ...(params.attachments?.length ? { attachments: params.attachments } : {}),
  };
  const res = await globalThis.fetch(url.toString(), {
    method: 'POST',
    headers: { ...authHeader(config.apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json()) as { message?: { id: number } };
}

/**
 * POST /answers — answer callback (button press). Required after message_callback.
 */
export async function answerMaxCallback(config: MaxClientConfig, params: MaxAnswerCallbackParams): Promise<boolean> {
  const base = config.baseUrl ?? MAX_API_BASE;
  const body: Record<string, unknown> = { callback_id: params.callbackId };
  if (params.notification) body.notification = params.notification;
  const res = await globalThis.fetch(`${base}/answers`, {
    method: 'POST',
    headers: { ...authHeader(config.apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export type MaxEditMessageParams = {
  messageId: number;
  text: string;
  format?: 'markdown' | 'html';
  attachments?: Array<{
    type: 'inline_keyboard';
    payload: { buttons: Array<Array<{ type: string; text: string; payload?: string; url?: string }>> };
  }>;
};

/**
 * PUT /messages?message_id={id} — edit message (e.g. after callback). MAX allows edit within 24h.
 */
export async function editMaxMessage(config: MaxClientConfig, params: MaxEditMessageParams): Promise<boolean> {
  const base = config.baseUrl ?? MAX_API_BASE;
  const url = new URL(`${base}/messages`);
  url.searchParams.set('message_id', String(params.messageId));
  const body: Record<string, unknown> = {
    text: params.text,
    ...(params.format ? { format: params.format } : {}),
    ...(params.attachments !== undefined ? { attachments: params.attachments } : {}),
  };
  const res = await globalThis.fetch(url.toString(), {
    method: 'PUT',
    headers: { ...authHeader(config.apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}
