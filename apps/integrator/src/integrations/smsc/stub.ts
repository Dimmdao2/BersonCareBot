import type { SmsClient } from './types.js';

type WarnLogger = {
  warn(payload: Record<string, unknown>, message: string): void;
};

/** Stub-клиент SMSC для окружений без реального API-ключа. */
export function createSmscStub(log: WarnLogger): SmsClient {
  return {
    async sendSms(input) {
      log.warn(
        {
          toPhone: input.toPhone,
          messageLength: input.message.length,
        },
        'smsc stub called',
      );
      return { ok: false, error: 'SMSC_NOT_IMPLEMENTED' };
    },
  };
}
