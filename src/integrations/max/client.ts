/**
 * MAX Platform API client via @maxhub/max-bot-api.
 * Docs: https://github.com/max-messenger/max-bot-api-client-ts
 */
import { Bot } from '@maxhub/max-bot-api';

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

export type MaxEditMessageParams = {
  messageId: number | string;
  text: string;
  format?: 'markdown' | 'html';
  attachments?: Array<{
    type: 'inline_keyboard';
    payload: { buttons: Array<Array<{ type: string; text: string; payload?: string; url?: string }>> };
  }>;
};

let cachedBot: { apiKey: string; bot: Bot } | null = null;

function getBot(apiKey: string): Bot {
  if (cachedBot?.apiKey === apiKey) return cachedBot.bot;
  cachedBot = { apiKey, bot: new Bot(apiKey) };
  return cachedBot.bot;
}

/**
 * GET /me — bot info (health/auth check).
 */
export async function getMaxBotInfo(config: MaxClientConfig): Promise<MaxBotInfo | null> {
  try {
    const bot = getBot(config.apiKey);
    const info = await bot.api.getMyInfo();
    if (!info?.user_id) return null;
    const raw = info as { user_id: number; name?: string; first_name?: string; username?: string | null; is_bot?: boolean; last_activity_time?: number };
    const result: MaxBotInfo = {
      user_id: raw.user_id,
      name: raw.name ?? raw.first_name ?? '',
      is_bot: raw.is_bot ?? true,
    };
    if (raw.username != null && raw.username !== '') result.username = raw.username;
    if (raw.last_activity_time != null) result.last_activity_time = raw.last_activity_time;
    return result;
  } catch {
    return null;
  }
}

/**
 * POST /messages?user_id={userId} — send message to user.
 */
export async function sendMaxMessage(
  config: MaxClientConfig,
  params: MaxSendMessageParams,
): Promise<{ message?: { id: number } } | null> {
  try {
    const bot = getBot(config.apiKey);
    const extra: Record<string, unknown> = {};
    if (params.format === 'html' || params.format === 'markdown') extra.format = params.format;
    if (params.attachments?.length) extra.attachments = params.attachments;
    const message = await bot.api.sendMessageToUser(params.userId, params.text, extra as never);
    return message?.body?.mid != null ? { message: { id: 0 } } : null;
  } catch (err) {
    const { logger } = await import('../../infra/observability/logger.js');
    logger.error({ err, userId: params.userId, textLength: params.text?.length }, 'max sendMessage failed');
    return null;
  }
}

/**
 * PUT /messages?message_id= — edit message. Library expects messageId as string.
 */
export async function editMaxMessage(config: MaxClientConfig, params: MaxEditMessageParams): Promise<boolean> {
  try {
    const bot = getBot(config.apiKey);
    const messageId = typeof params.messageId === 'string' ? params.messageId : String(params.messageId);
    const extra: Record<string, unknown> = { text: params.text };
    if (params.format === 'html' || params.format === 'markdown') extra.format = params.format;
    if (params.attachments !== undefined) extra.attachments = params.attachments;
    await bot.api.editMessage(messageId, extra as never);
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /answers — answer callback (button press).
 */
export async function answerMaxCallback(config: MaxClientConfig, params: MaxAnswerCallbackParams): Promise<boolean> {
  try {
    const bot = getBot(config.apiKey);
    await bot.api.answerOnCallback(params.callbackId, params.notification ? { notification: params.notification } : undefined);
    return true;
  } catch {
    return false;
  }
}
