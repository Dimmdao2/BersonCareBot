import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createContentPort } from '../../../infra/adapters/contentPort.js';
import { createTemplatePort } from '../../../infra/adapters/templatePort.js';
import type {
  Action,
  DbWritePort,
  DomainContext,
  OutgoingIntent,
  WebappEventsPort,
} from '../../contracts/index.js';
import { executeAction } from './executeAction.js';

const HOME_SCRIPT_IDS = [
  'telegram.start',
  'telegram.contact.link.confirm',
  'telegram.cabinet.open',
  'telegram.cabinet.open.callback',
] as const;

function context(source: 'telegram' | 'max'): DomainContext {
  return {
    event: {
      type: 'message.received',
      meta: {
        eventId: `event-993-home-${source}`,
        occurredAt: '2026-07-30T10:30:00.000Z',
        source,
      },
      payload: { incoming: { chatId: source === 'telegram' ? 99311 : '99312' } },
    },
    nowIso: '2026-07-30T10:30:00.000Z',
    values: {},
    base: {
      actor: { isAdmin: false },
      identityLinks: [],
      facts: { links: { webappHomeUrl: 'https://app.example.test/auth' } },
    },
  };
}

describe('main menu mini-app retirement', () => {
  it('keeps booking and ordinary browser links without Telegram/MAX app launch markup', async () => {
    const contentPort = createContentPort({
      rootDir: path.resolve(process.cwd(), 'src/content'),
    });
    const templatePort = createTemplatePort({ contentPort });
    const telegramBundle = await contentPort.getBundle?.({
      source: 'telegram',
      audience: 'user',
    });
    const maxBundle = await contentPort.getBundle?.({ source: 'max', audience: 'user' });

    expect(telegramBundle).not.toBeNull();
    expect(maxBundle).not.toBeNull();
    if (!telegramBundle || !maxBundle) throw new Error('user content bundles are required');

    expect(JSON.stringify(telegramBundle.mainReplyKeyboard)).toContain('telegram:menu.book');
    expect(JSON.stringify(telegramBundle.menus?.main)).toContain('booking.open');
    expect(JSON.stringify(maxBundle.menus?.main)).toContain('booking.open');
    expect(JSON.stringify(telegramBundle.mainReplyKeyboard)).not.toContain('webAppUrlFact');
    expect(JSON.stringify(telegramBundle.menus?.main)).not.toContain('webAppUrlFact');
    expect(JSON.stringify(maxBundle.menus?.main)).not.toContain('webAppUrlFact');

    const scriptsById = new Map(telegramBundle.scripts.map((script) => [script.id, script]));
    for (const id of HOME_SCRIPT_IDS) {
      const script = scriptsById.get(id);
      expect(script, `missing runtime content script ${id}`).toBeDefined();
      expect(JSON.stringify(script)).not.toContain('webAppUrlFact');
      expect(script?.steps.length).toBeGreaterThan(0);
    }

    const cases: Array<{
      source: 'telegram' | 'max';
      action: Action;
    }> = [
      {
        source: 'telegram',
        action: {
          id: 'telegram-main-menu',
          type: 'message.replyKeyboard.show',
          mode: 'async',
          params: {
            chatId: 99311,
            text: 'Меню',
            keyboard: telegramBundle.mainReplyKeyboard,
            resizeKeyboard: true,
          },
        },
      },
      {
        source: 'max',
        action: {
          id: 'max-main-menu',
          type: 'message.inlineKeyboard.show',
          mode: 'async',
          params: { chatId: '99312', text: 'Меню', menu: 'main' },
        },
      },
    ];

    for (const item of cases) {
      const result = await executeAction(item.action, context(item.source), {
        contentPort,
        templatePort,
      });
      const intent = result.intents?.[0] as OutgoingIntent | undefined;
      const markup = JSON.stringify(intent?.payload.replyMarkup);

      expect(result.status).toBe('success');
      expect(markup).not.toContain('web_app');
      expect(markup).not.toContain('open_app');
    }

    const browserLinkResult = await executeAction(
      {
        id: 'ordinary-browser-auth-link',
        type: 'message.inlineKeyboard.show',
        mode: 'async',
        params: {
          chatId: 99311,
          text: 'Войти',
          inlineKeyboard: [[{ text: 'Открыть вход', urlFact: 'links.webappHomeUrl' }]],
        },
      },
      context('telegram'),
      { contentPort, templatePort },
    );
    const browserIntent = browserLinkResult.intents?.[0] as OutgoingIntent | undefined;
    const browserMarkup = JSON.stringify(browserIntent?.payload.replyMarkup);

    expect(browserMarkup).toContain('https://app.example.test/auth');
    expect(browserMarkup).toContain('"url"');
    expect(browserMarkup).not.toContain('web_app');
  });

  it('keeps post-bind booking menus without restoring an in-bot app launch', async () => {
    const contentPort = createContentPort({
      rootDir: path.resolve(process.cwd(), 'src/content'),
    });
    const templatePort = createTemplatePort({ contentPort });
    const writePort: DbWritePort = {
      writeDb: async (write) => {
        if (write.type === 'user.phone.link') return { userPhoneLinkApplied: true };
      },
    };
    const webappEventsPort: WebappEventsPort = {
      emit: async () => ({ ok: true, status: 200 }),
      completePhoneMessengerBind: async () => ({
        ok: true,
        purpose: 'profile_bind' as const,
      }),
      completeChannelLink: async () => ({
        ok: true,
        needsPhone: false,
        phoneNormalized: '+79990000993',
      }),
    };

    const cases: Array<{ source: 'telegram' | 'max'; action: Action }> = [
      {
        source: 'telegram',
        action: {
          id: 'phone-messenger-bind-complete-telegram',
          type: 'webapp.phoneMessengerBind.complete',
          mode: 'sync',
          params: {
            setupToken: 'setup-token-993',
            channelCode: 'telegram',
            externalId: '99311',
            phoneNormalized: '+79990000993',
          },
        },
      },
      {
        source: 'max',
        action: {
          id: 'phone-messenger-bind-complete-max',
          type: 'webapp.phoneMessengerBind.complete',
          mode: 'sync',
          params: {
            setupToken: 'setup-token-993',
            channelCode: 'max',
            externalId: '99312',
            phoneNormalized: '+79990000993',
          },
        },
      },
      {
        source: 'telegram',
        action: {
          id: 'channel-link-complete-telegram',
          type: 'webapp.channelLink.complete',
          mode: 'sync',
          params: {
            linkToken: 'link-token-993',
            channelCode: 'telegram',
            externalId: '99311',
          },
        },
      },
    ];

    for (const item of cases) {
      const result = await executeAction(item.action, context(item.source), {
        contentPort,
        templatePort,
        webappEventsPort,
        writePort,
      });
      const serializedIntents = JSON.stringify(result.intents);

      expect(result.status).toBe('success');
      expect(serializedIntents).toMatch(/Запись на приём|booking\.open/);
      expect(serializedIntents).not.toContain('web_app');
      expect(serializedIntents).not.toContain('open_app');
      expect(serializedIntents).not.toContain('menu.app');
    }
  });
});
