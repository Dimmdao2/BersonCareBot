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
import { buildPatientReminderDeepLink } from '../reminders/buildPatientReminderDeepLink.js';
import { buildReminderDispatchInlineKeyboard } from '../reminders/reminderInlineKeyboard.js';
import { createOrchestrator } from '../../orchestrator/index.js';
import { executeAction } from './executeAction.js';

type MenuCase = {
  source: 'telegram' | 'max';
  scriptId: 'telegram.more.menu' | 'max.more.menu';
};

const MENU_CASES: readonly MenuCase[] = [
  { source: 'telegram', scriptId: 'telegram.more.menu' },
  { source: 'max', scriptId: 'max.more.menu' },
];

function createEvent(testCase: MenuCase): IncomingEvent {
  return {
    type: 'message.received',
    meta: {
      eventId: `event-993-${testCase.scriptId}`,
      occurredAt: '2026-08-02T14:00:00.000Z',
      source: testCase.source,
    },
    payload: {
      incoming: {
        action: 'menu.more',
        chatId: testCase.source === 'telegram' ? 99301 : 99302,
        channelUserId: testCase.source === 'telegram' ? 99301 : 99302,
      },
    },
  };
}

function createBaseContext(): BaseContext {
  return {
    actor: { isAdmin: false },
    identityLinks: [],
    linkedPhone: true,
    facts: { links: { remindersUrl: 'https://app.example.test/app/patient/reminders' } },
  };
}

function toAction(step: Step): Action {
  return { id: step.id, type: step.kind, mode: step.mode, params: step.payload };
}

function buttonHasMiniAppLaunch(button: unknown): boolean {
  if (!button || typeof button !== 'object') return false;
  const record = button as Record<string, unknown>;
  return 'web_app' in record || 'open_app' in record;
}

describe('diary and reminder mini-app retirement', () => {
  it.each(MENU_CASES)(
    '$scriptId builds an ordinary reminder browser button instead of a mini-app launch',
    async (testCase) => {
      const contentPort = createContentPort({ rootDir: path.resolve(process.cwd(), 'src/content') });
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

      expect(messageStep, `${testCase.scriptId} must retain its bot response`).toBeDefined();
      if (!messageStep) throw new Error(`${testCase.scriptId} message step is required`);

      const context: DomainContext = {
        event,
        nowIso: '2026-08-02T14:00:00.000Z',
        values: {},
        base,
      };
      const result = await executeAction(toAction(messageStep), context, { contentPort, templatePort });
      const intent = result.intents?.[0] as OutgoingIntent | undefined;
      const keyboard = (
        intent?.payload as { replyMarkup?: { inline_keyboard?: unknown[][] } } | undefined
      )?.replyMarkup?.inline_keyboard;
      const buttons = keyboard?.flat() ?? [];

      expect(result.status).toBe('success');
      expect(buttons).toContainEqual({
        text: expect.any(String),
        url: 'https://app.example.test/app/patient/reminders',
      });
      expect(buttons.some(buttonHasMiniAppLaunch)).toBe(false);
    },
  );

  it('keeps the diary target and all reminder callbacks in the real dispatch keyboard', () => {
    const diaryUrl = buildPatientReminderDeepLink({
      appBaseUrl: 'https://app.example.test',
      linkedObjectType: 'lfk_complex',
      linkedObjectId: 'diary-complex-993',
    });
    const occurrenceId = '993-reminder-occurrence';
    const keyboard = buildReminderDispatchInlineKeyboard({
      primaryLabel: 'Начать тренировку',
      primaryUrl: diaryUrl,
      scheduleUrl: 'https://app.example.test/app/patient/reminders?from=reminder',
      occurrenceId,
    });
    const buttons = keyboard.inline_keyboard.flat();

    expect(buttons).toContainEqual({ text: 'Начать тренировку', url: diaryUrl });
    expect(buttons).toContainEqual({
      text: 'Расписание',
      url: 'https://app.example.test/app/patient/reminders?from=reminder',
    });
    expect(buttons).toContainEqual({
      text: 'Напомнить позже',
      callback_data: `rem_snooze_menu:${occurrenceId}`,
    });
    expect(buttons).toContainEqual({ text: 'Пропущу', callback_data: `rem_skip:${occurrenceId}` });
    expect(buttons).toContainEqual({
      text: 'Настройки уведомлений',
      callback_data: `rem_notif_settings:${occurrenceId}`,
    });
    expect(buttons.some(buttonHasMiniAppLaunch)).toBe(false);
  });
});
