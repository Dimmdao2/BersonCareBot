import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('max user static content', () => {
  it('scripts: max.contact.phone.link — low priority and excludes phoneauth/contact await states', () => {
    const scripts = JSON.parse(readFileSync(join(dir, 'scripts.json'), 'utf8')) as Array<{
      id: string;
      priority?: number;
      match?: { context?: { conversationState?: { $notStartsWith?: string[] } }; input?: { phonePresent?: boolean } };
      steps?: Array<{ action?: string }>;
    }>;
    const link = scripts.find((s) => s.id === 'max.contact.phone.link');
    expect(link?.priority).toBe(10);
    expect(link?.match?.input?.phonePresent).toBe(true);
    expect(link?.match?.context?.conversationState?.$notStartsWith).toEqual([
      'await_phoneauth:',
      'await_contact:',
    ]);
    expect(link?.steps?.[0]?.action).toBe('user.phone.link');
  });

  it('scripts: start.phoneauth and contact.phoneauth for phone login bind', () => {
    const scripts = JSON.parse(readFileSync(join(dir, 'scripts.json'), 'utf8')) as Array<{
      id: string;
      priority?: number;
      match?: Record<string, unknown>;
      steps?: Array<{ action?: string; params?: Record<string, unknown> }>;
    }>;
    const start = scripts.find((s) => s.id === 'max.start.phoneauth');
    expect(start?.priority).toBe(56);
    const contact = scripts.find((s) => s.id === 'max.contact.phoneauth');
    expect(contact?.priority).toBe(54);
    expect(contact?.steps?.[0]?.action).toBe('webapp.phoneMessengerBind.complete');
    const onboarding = scripts.find((s) => s.id === 'max.start.onboarding');
    const exclude = (onboarding?.match as { input?: { excludeActions?: string[] } })?.input?.excludeActions;
    expect(exclude).toContain('start.phoneauth');
  });

  it('scripts: max.start.link — высокий priority (выше диалога/reminder freeText) и externalId = meta.userId (id пользователя MAX)', () => {
    const scripts = JSON.parse(readFileSync(join(dir, 'scripts.json'), 'utf8')) as Array<{
      id: string;
      priority?: number;
      steps?: Array<{ action?: string; params?: Record<string, unknown> }>;
    }>;
    const link = scripts.find((s) => s.id === 'max.start.link');
    expect(link?.priority).toBe(55);
    const step = link?.steps?.find((s) => s.action === 'webapp.channelLink.complete');
    expect((step?.params as { externalId?: string })?.externalId).toBe('{{meta.userId}}');
  });

  it('scripts: max.start.onboarding — inline request_contact (как M2M и need_phone ветки)', () => {
    const scripts = JSON.parse(readFileSync(join(dir, 'scripts.json'), 'utf8')) as Array<{
      id: string;
      steps?: Array<{ action?: string; params?: Record<string, unknown> }>;
    }>;
    const onb = scripts.find((s) => s.id === 'max.start.onboarding');
    expect(onb).toBeTruthy();
    const stateStep = onb?.steps?.find((s) => s.action === 'user.state.set');
    expect((stateStep?.params as { state?: string })?.state).toBe('await_contact:subscription');
    const sendStep = onb?.steps?.find((s) => s.action === 'message.send');
    expect(sendStep?.params?.inlineKeyboard).toEqual([
      [{ textTemplateKey: 'max:requestContact.button', requestPhone: true }],
    ]);
  });

  it('menu.json main — одна строка: запись (callback) и приложение (WebApp на главную), паритет с Telegram', () => {
    const menus = JSON.parse(readFileSync(join(dir, 'menu.json'), 'utf8')) as {
      main: Array<Array<{ textTemplateKey?: string; callbackData?: string; webAppUrlFact?: string }>>;
    };
    expect(menus.main).toHaveLength(1);
    expect(menus.main[0]).toEqual([
      { textTemplateKey: 'max:menu.book', callbackData: 'booking.open' },
      { textTemplateKey: 'max:menu.app', webAppUrlFact: 'links.webappHomeUrl' },
    ]);
  });

  it('scripts: max.more.menu — промпт вебаппа как в Telegram (message.send + WebApp-кнопка)', () => {
    const scripts = JSON.parse(readFileSync(join(dir, 'scripts.json'), 'utf8')) as Array<{
      id: string;
      steps?: Array<{ action?: string; params?: Record<string, unknown> }>;
    }>;
    const more = scripts.find((s) => s.id === 'max.more.menu');
    expect(more).toBeTruthy();
    const send = more?.steps?.find(
      (s) =>
        s.action === 'message.send'
        && (s.params as { _when?: { path?: string } })?._when?.path === 'facts.links.webappRemindersUrl',
    );
    expect(send?.params?.templateKey).toBe('max:menu.webapp.prompt');
  });
});
