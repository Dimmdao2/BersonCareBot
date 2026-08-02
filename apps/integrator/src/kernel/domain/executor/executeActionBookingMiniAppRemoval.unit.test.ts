import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createContentPort } from '../../../infra/adapters/contentPort.js';
import { createTemplatePort } from '../../../infra/adapters/templatePort.js';
import type {
  Action,
  BaseContext,
  DomainContext,
  IncomingEvent,
  OutgoingIntent,
  Step,
} from '../../contracts/index.js';
import { createOrchestrator } from '../../orchestrator/index.js';
import { executeAction } from './executeAction.js';

type BookingCase = {
  scriptId: string;
  source: 'telegram' | 'max';
  eventType: 'message.received' | 'callback.received';
  action: 'booking.open' | 'booking.menu';
};

const BOOKING_CASES: readonly BookingCase[] = [
  {
    scriptId: 'telegram.booking.open',
    source: 'telegram',
    eventType: 'message.received',
    action: 'booking.open',
  },
  {
    scriptId: 'telegram.booking.menu',
    source: 'telegram',
    eventType: 'callback.received',
    action: 'booking.menu',
  },
  {
    scriptId: 'max.booking.open',
    source: 'max',
    eventType: 'message.received',
    action: 'booking.open',
  },
  {
    scriptId: 'max.booking.menu',
    source: 'max',
    eventType: 'callback.received',
    action: 'booking.menu',
  },
  {
    scriptId: 'max.booking.open.callback',
    source: 'max',
    eventType: 'callback.received',
    action: 'booking.open',
  },
];

function createEvent(testCase: BookingCase): IncomingEvent {
  const eventId = `event-993-${testCase.scriptId}`;
  return {
    type: testCase.eventType,
    meta: {
      eventId,
      occurredAt: '2026-07-30T12:00:00.000Z',
      source: testCase.source,
    },
    payload: {
      incoming: {
        action: testCase.action,
        chatId: testCase.source === 'telegram' ? 99301 : 99302,
        channelUserId: testCase.source === 'telegram' ? 99301 : 99302,
        ...(testCase.eventType === 'callback.received'
          ? {
              messageId: 99303,
              callbackQueryId: `${eventId}:callback`,
            }
          : {}),
      },
    },
  };
}

function createBaseContext(): BaseContext {
  return {
    actor: { isAdmin: false },
    identityLinks: [],
    linkedPhone: true,
    facts: {
      links: {
        webappCabinetUrl: 'https://app.example.test/app/patient/cabinet',
        webappAddressUrl: 'https://app.example.test/app/patient/help/address',
      },
    },
  };
}

function toAction(step: Step): Action {
  return {
    id: step.id,
    type: step.kind,
    mode: step.mode,
    params: step.payload,
  };
}

describe('booking mini-app retirement', () => {
  it.each(BOOKING_CASES)(
    '$scriptId keeps the bot booking callbacks without an in-bot app launch',
    async (testCase) => {
      const contentRootOverride = process.env.BCB_BOOKING_MINIAPP_CONTENT_ROOT?.trim();
      const contentPort = createContentPort({
        rootDir: contentRootOverride
          ? path.resolve(contentRootOverride)
          : path.resolve(process.cwd(), 'src/content'),
      });
      const templatePort = createTemplatePort({ contentPort });
      const orchestrator = createOrchestrator({
        contentPort,
        contextQueryPort: { request: async () => null },
      });
      const event = createEvent(testCase);
      const base = createBaseContext();
      const plan = await orchestrator.buildPlan({ event, context: base });
      const messageStep = plan.find(
        (step) => step.kind === 'message.send' || step.kind === 'message.edit',
      );

      expect(messageStep, `${testCase.scriptId} must emit a message step`).toBeDefined();
      if (!messageStep) throw new Error(`${testCase.scriptId} message step is required`);

      const context: DomainContext = {
        event,
        nowIso: '2026-07-30T12:00:00.000Z',
        values: {},
        base,
      };
      const result = await executeAction(toAction(messageStep), context, {
        contentPort,
        templatePort,
      });
      const intent = result.intents?.[0] as OutgoingIntent | undefined;
      const replyMarkup = JSON.stringify(intent?.payload.replyMarkup);

      expect(result.status).toBe('success');
      expect(replyMarkup).toContain('"callback_data":"bookings.show"');
      expect(replyMarkup).toContain('"callback_data":"info.prepare"');
      expect(replyMarkup).toContain('"callback_data":"info.address"');
      expect(replyMarkup).not.toContain('web_app');
      expect(replyMarkup).not.toContain('open_app');
    },
  );
});
