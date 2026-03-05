import type { Action, ActionResult, DomainContext, IncomingEvent, OutgoingIntent } from '../../contracts/index.js';
import { handleIncomingEvent } from '../handleIncomingEvent.js';

type RubitimeTelegramUser = {
  chatId: number;
  telegramId: string;
  username: string | null;
};

type ProcessAcceptedIncomingEventDeps = {
  executeAction: (action: Action, context: DomainContext) => Promise<ActionResult>;
  dispatchIntent: (intent: OutgoingIntent) => Promise<void>;
  findTelegramUserByPhone?: (phoneNormalized: string) => Promise<RubitimeTelegramUser | null>;
  adminTelegramId?: number;
};

function readRubitimePhone(event: IncomingEvent): string | null {
  if (event.meta.source !== 'rubitime') return null;
  const payload = event.payload as { body?: { data?: { phone?: unknown } } };
  const phone = payload.body?.data?.phone;
  return typeof phone === 'string' && phone.trim().length > 0 ? phone : null;
}

/**
 * Domain entrypoint for already accepted gateway events.
 * Owns context preparation + script resolution + action execution + intent dispatch.
 */
export async function processAcceptedIncomingEvent(
  event: IncomingEvent,
  deps: ProcessAcceptedIncomingEventDeps,
): Promise<void> {
  const domainResult = await handleIncomingEvent(event, {
    async buildContext(incomingEvent) {
      const phoneNormalized = readRubitimePhone(incomingEvent);
      const telegramUser = phoneNormalized && deps.findTelegramUserByPhone
        ? await deps.findTelegramUserByPhone(phoneNormalized)
        : null;

      const values: DomainContext['values'] = {};
      if (incomingEvent.meta.source === 'rubitime') {
        values.rubitimeRecipientContext = {
          phoneNormalized: phoneNormalized ?? '',
          hasTelegramUser: telegramUser !== null,
          telegramUser,
          isTelegramAdmin: Boolean(
            telegramUser
              && Number.isFinite(deps.adminTelegramId)
              && String(telegramUser.telegramId) === String(deps.adminTelegramId),
          ),
          isAppAdmin: false,
          telegramNotificationsEnabled: true,
        };
      }

      return {
        event: incomingEvent,
        nowIso: new Date().toISOString(),
        values,
      };
    },
    async executeAction(action, context) {
      return deps.executeAction(action, context);
    },
  });

  for (const intent of domainResult.intents) {
    await deps.dispatchIntent(intent);
  }
}
