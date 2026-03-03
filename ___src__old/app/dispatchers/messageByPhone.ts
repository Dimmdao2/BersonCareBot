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

type RetryPolicy = {
  retries: number;
  factor: number;
  minTimeout: number;
  maxTimeout: number;
  randomize: boolean;
};

export function createMessageByPhoneDispatcher(deps: {
  findTelegramUserByPhone: FindTelegramUserByPhone;
  sendTelegramMessage: SendTelegramMessage;
  smsClient: SmsClient;
  retryPolicy?: RetryPolicy;
}): MessageByPhoneDispatcher {
  const {
    findTelegramUserByPhone,
    sendTelegramMessage,
    smsClient,
    retryPolicy = {
      retries: 2,
      factor: 2,
      minTimeout: 300,
      maxTimeout: 1200,
      randomize: true,
    },
  } = deps;

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

      let lastFailureKind: 'permanent' | 'transient' | 'unknown' = 'unknown';
      let lastFailureCode: unknown = undefined;

      try {
        await pRetry(
          async () => {
            try {
              await sendTelegramMessage(user.chatId, input.messageText);
              lastFailureKind = 'unknown';
              lastFailureCode = undefined;
            } catch (err) {
              const errorCode = (err as { error_code?: unknown })?.error_code;
              // Permanent delivery errors are not retried.
              if (errorCode === 400 || errorCode === 403) {
                lastFailureKind = 'permanent';
                lastFailureCode = errorCode;
                throw new AbortError(err as Error);
              }
              lastFailureKind = 'transient';
              lastFailureCode = errorCode;
              throw err as Error;
            }
          },
          {
            ...retryPolicy,
            onFailedAttempt: (error) => {
              ctxLogger.warn(
                {
                  attemptNumber: error.attemptNumber,
                  retriesLeft: error.retriesLeft,
                  reason: lastFailureKind,
                  errorCode: lastFailureCode,
                },
                'telegram delivery attempt failed',
              );
            },
          },
        );
        ctxLogger.info({ delivery: 'telegram' }, 'delivery completed');
      } catch (err) {
        const fallbackReason = ({
          permanent: 'telegram_delivery_permanent',
          transient: 'telegram_delivery_retry_exhausted',
          unknown: 'telegram_delivery_failed',
        } as const)[lastFailureKind];
        ctxLogger.error({ err, reason: fallbackReason, errorCode: lastFailureCode }, 'telegram delivery failed');
        await fallbackSms(fallbackReason);
      }
    },
  };
}
