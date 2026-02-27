import pRetry, { AbortError } from 'p-retry';
import type { SmsClient } from '../../integrations/smsc/types.js';
import { logger } from '../../observability/logger.js';

type FindTelegramUserByPhone = (phoneNormalized: string) => Promise<{
  chatId: number;
  telegramId: string;
  username: string | null;
} | null>;

type SendTelegramMessage = (chatId: number, text: string) => Promise<unknown>;

export type MessageByPhoneInput = {
  phoneNormalized: string;
  messageText: string;
  smsFallbackText: string;
  correlationId?: string;
};

export type MessageByPhoneDispatcher = {
  dispatchMessageByPhone(input: MessageByPhoneInput): Promise<void>;
};

export function createMessageByPhoneDispatcher(deps: {
  findTelegramUserByPhone: FindTelegramUserByPhone;
  sendTelegramMessage: SendTelegramMessage;
  smsClient: SmsClient;
}): MessageByPhoneDispatcher {
  const { findTelegramUserByPhone, sendTelegramMessage, smsClient } = deps;

  return {
    async dispatchMessageByPhone(input) {
      const ctxLogger = logger.child({
        correlationId: input.correlationId,
        phoneNormalized: input.phoneNormalized,
      });

      const fallbackSms = async (reason: string) => {
        ctxLogger.warn({ reason }, 'fallback to sms');
        await smsClient.sendSms({
          toPhone: input.phoneNormalized ?? '',
          message: input.smsFallbackText,
        });
      };

      if (!input.phoneNormalized) {
        await fallbackSms('missing_phone');
        return;
      }

      const user = await findTelegramUserByPhone(input.phoneNormalized);
      if (!user) {
        await fallbackSms('telegram_user_not_found');
        return;
      }

      try {
        await pRetry(
          async () => {
            try {
              await sendTelegramMessage(user.chatId, input.messageText);
            } catch (err) {
              const errorCode = (err as { error_code?: unknown })?.error_code;
              // Permanent delivery errors are not retried.
              if (errorCode === 400 || errorCode === 403) {
                throw new AbortError(err as Error);
              }
              throw err as Error;
            }
          },
          {
            retries: 2,
            factor: 2,
            minTimeout: 300,
            maxTimeout: 1200,
            randomize: true,
          },
        );
      } catch (err) {
        ctxLogger.error({ err }, 'telegram delivery failed after retries');
        await fallbackSms('telegram_delivery_failed');
      }
    },
  };
}
