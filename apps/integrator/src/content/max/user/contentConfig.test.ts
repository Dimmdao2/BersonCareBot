import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('max user static content', () => {
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

  it('menu.json main — одна строка: запись, дневник, меню (webapp)', () => {
    const menus = JSON.parse(readFileSync(join(dir, 'menu.json'), 'utf8')) as {
      main: Array<Array<{ textTemplateKey?: string; callbackData?: string; webAppUrlFact?: string }>>;
    };
    expect(menus.main).toHaveLength(1);
    expect(menus.main[0]).toEqual([
      { textTemplateKey: 'max:menu.book', webAppUrlFact: 'links.bookingUrl', callbackData: 'booking.open' },
      { textTemplateKey: 'max:menu.diary', webAppUrlFact: 'links.webappDiaryUrl', callbackData: 'diary.open' },
      { textTemplateKey: 'max:menu.more', webAppUrlFact: 'links.webappRemindersUrl', callbackData: 'menu.more' },
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
