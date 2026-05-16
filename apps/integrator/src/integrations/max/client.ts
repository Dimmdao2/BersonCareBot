/**
 * MAX Platform API client via @maxhub/max-bot-api.
 * Docs: https://github.com/max-messenger/max-bot-api-client-ts
 */
import { Bot } from '@maxhub/max-bot-api';
import type { AttachmentRequest, BotCommand, BotInfo, Message, MessageLinkType } from '@maxhub/max-bot-api/types';

export type MaxClientConfig = {
  apiKey: string;
  baseUrl?: string;
};

export type MaxBotInfo = BotInfo;

export type MaxSendMessageExtra = {
  attachments?: AttachmentRequest[] | null;
  disable_link_preview?: boolean;
  link?: { type: MessageLinkType; mid: string } | null;
  notify?: boolean;
  format?: 'markdown' | 'html' | null;
};

export type MaxEditMessageExtra = {
  text?: string | null;
  attachments?: AttachmentRequest[] | null;
  link?: { type: MessageLinkType; mid: string } | null;
  notify?: boolean;
  format?: 'markdown' | 'html' | null;
};

export type MaxAnswerCallbackExtra = {
  message?: MaxEditMessageExtra | null;
  notification?: string | null;
};

export type MaxSendMessageParams = {
  chatId?: number;
  userId?: number;
  text: string;
  extra?: MaxSendMessageExtra;
};

export type MaxAnswerCallbackParams = {
  callbackId: string;
  extra?: MaxAnswerCallbackExtra;
};

export type MaxEditMessageParams = {
  messageId: string;
  extra?: MaxEditMessageExtra;
};

let cachedBot: { cacheKey: string; bot: Bot } | null = null;

/** `sendMessageToChat` требует chat_id диалога; в БД/привязке часто хранится platform user_id — тогда нужен `sendMessageToUser`. */
function isMaxDialogNotFoundError(err: unknown): boolean {
  const m =
    err !== null && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
      ? (err as { message: string }).message
      : err instanceof Error
        ? err.message
        : String(err);
  return m.includes('dialog.notfound') || m.includes('error.dialog.notfound');
}

function getBot(config: MaxClientConfig): Bot {
  const cacheKey = `${config.apiKey}::${config.baseUrl ?? ''}`;
  if (cachedBot?.cacheKey === cacheKey) return cachedBot.bot;
  cachedBot = {
    cacheKey,
    bot: new Bot(
      config.apiKey,
      config.baseUrl ? { clientOptions: { baseUrl: config.baseUrl } } : undefined,
    ),
  };
  return cachedBot.bot;
}

/**
 * GET /me — bot info (health/auth check).
 */
export async function getMaxBotInfo(config: MaxClientConfig): Promise<MaxBotInfo | null> {
  try {
    const bot = getBot(config);
    return await bot.api.getMyInfo();
  } catch {
    return null;
  }
}

export async function setMaxBotCommands(
  config: MaxClientConfig,
  commands: BotCommand[],
): Promise<boolean> {
  try {
    const bot = getBot(config);
    await bot.api.setMyCommands(commands);
    return true;
  } catch (err) {
    const { logger } = await import('../../infra/observability/logger.js');
    logger.error({ err, commandsCount: commands.length }, 'max setMyCommands failed');
    return false;
  }
}

/**
 * POST /messages?chat_id= or ?user_id= — send message.
 */
export async function sendMaxMessage(
  config: MaxClientConfig,
  params: MaxSendMessageParams,
): Promise<Message | null> {
  const { logger } = await import('../../infra/observability/logger.js');
  try {
    const bot = getBot(config);
    if (params.userId != null) {
      return await bot.api.sendMessageToUser(params.userId, params.text, params.extra);
    }
    if (params.chatId != null) {
      const chatId = params.chatId;
      try {
        return await bot.api.sendMessageToChat(chatId, params.text, params.extra);
      } catch (errFirst) {
        if (!isMaxDialogNotFoundError(errFirst)) throw errFirst;
        logger.info({ chatIdFailedAsDialog: chatId }, 'max sendMessageToChat dialog not found, retry sendMessageToUser');
        try {
          return await bot.api.sendMessageToUser(chatId, params.text, params.extra);
        } catch (errFallback) {
          logger.error(
            { err: errFallback, chatIdTriedAsUserId: chatId, textLength: params.text?.length },
            'max sendMessageToUser after dialog.notfound failed',
          );
          return null;
        }
      }
    }
    return null;
  } catch (err) {
    logger.error(
      { err, chatId: params.chatId, userId: params.userId, textLength: params.text?.length },
      'max sendMessage failed',
    );
    return null;
  }
}

/**
 * PUT /messages?message_id= — edit message. Library expects messageId as string.
 */
export async function editMaxMessage(config: MaxClientConfig, params: MaxEditMessageParams): Promise<boolean> {
  try {
    const bot = getBot(config);
    await bot.api.editMessage(params.messageId, params.extra);
    return true;
  } catch (err) {
    const { logger } = await import('../../infra/observability/logger.js');
    logger.error({ err, messageId: params.messageId }, 'max editMessage failed');
    return false;
  }
}

/**
 * DELETE /messages?message_id= — remove message (best-effort; soft-fail for reminder stale-delete).
 */
export async function deleteMaxMessage(config: MaxClientConfig, messageId: string): Promise<boolean> {
  const mid = typeof messageId === 'string' ? messageId.trim() : '';
  if (!mid) return false;
  try {
    const bot = getBot(config);
    await bot.api.deleteMessage(mid);
    return true;
  } catch (err) {
    const { logger } = await import('../../infra/observability/logger.js');
    logger.error({ err, messageId: mid }, 'max deleteMessage failed');
    return false;
  }
}

/**
 * POST /answers — answer callback (button press).
 */
export async function answerMaxCallback(config: MaxClientConfig, params: MaxAnswerCallbackParams): Promise<boolean> {
  try {
    const bot = getBot(config);
    await bot.api.answerOnCallback(params.callbackId, params.extra);
    return true;
  } catch (err) {
    const { logger } = await import('../../infra/observability/logger.js');
    logger.error({ err, callbackId: params.callbackId }, 'max answerOnCallback failed');
    return false;
  }
}
