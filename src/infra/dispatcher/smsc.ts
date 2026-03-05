import type { DispatchPort, OutgoingIntent } from '../../kernel/contracts/index.js';
import type { SmsClient } from '../../integrations/smsc/types.js';

/** SMSC dispatch adapter placeholder for V2 infra layer. */
export function createSmscDispatchPort(deps: { smsClient: SmsClient }): DispatchPort {
  return {
    async dispatchOutgoing(intent: OutgoingIntent): Promise<void> {
      if (intent.type !== 'message.send') return;
      const payload = intent.payload as {
        recipient?: { phoneNormalized?: string };
        message?: { text?: string };
      };
      const toPhone = payload.recipient?.phoneNormalized ?? '';
      const message = payload.message?.text ?? '';
      if (!toPhone || !message) return;
      await deps.smsClient.sendSms({ toPhone, message });
    },
  };
}
