import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('telegram user static content', () => {
  it('replyMenu: одна строка — запись, дневник и меню; diary/menu открывают webapp сразу', () => {
    const rows = JSON.parse(readFileSync(join(dir, 'replyMenu.json'), 'utf8')) as Array<
      Array<{ textTemplateKey: string; webAppUrlFact?: string }>
    >;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([
      { textTemplateKey: 'telegram:menu.book' },
      { textTemplateKey: 'telegram:menu.diary', webAppUrlFact: 'links.webappDiaryUrl' },
      { textTemplateKey: 'telegram:menu.more', webAppUrlFact: 'links.webappRemindersUrl' },
    ]);
  });

  it('scripts: telegram.booking.menu — тот же экран записи через message.edit (назад из подменю записи)', () => {
    const scripts = JSON.parse(readFileSync(join(dir, 'scripts.json'), 'utf8')) as Array<{
      id: string;
      steps?: Array<{ action?: string; params?: Record<string, unknown> }>;
    }>;
    const menu = scripts.find((s) => s.id === 'telegram.booking.menu');
    expect(menu).toBeTruthy();
    const editStep = menu?.steps?.find(
      (step) =>
        step.action === 'message.edit'
        && (step.params as { _when?: { and?: Array<{ path?: string }> } })?._when?.and?.[0]?.path === 'facts.links.webappCabinetUrl',
    );
    expect(editStep?.params?.inlineKeyboard).toEqual([
      [{ textTemplateKey: 'telegram:bookingMenu.my', webAppUrlFact: 'links.webappCabinetUrl' }],
      [{ textTemplateKey: 'telegram:bookingsScreen.prepare', callbackData: 'info.prepare' }],
      [{ textTemplateKey: 'telegram:bookingsScreen.address', webAppUrlFact: 'links.webappAddressUrl' }],
    ]);
  });

  it('scripts: telegram.booking.open — под текстом записи три inline-кнопки столбиком (кабинет webapp, подготовка, адрес webapp)', () => {
    const scripts = JSON.parse(readFileSync(join(dir, 'scripts.json'), 'utf8')) as Array<{
      id: string;
      steps?: Array<{ action?: string; params?: Record<string, unknown> }>;
    }>;
    const booking = scripts.find((s) => s.id === 'telegram.booking.open');
    expect(booking).toBeTruthy();
    const sendStep = booking?.steps?.find((step) =>
      step.action === 'message.send'
      && (step.params as { _when?: { and?: Array<{ path?: string; truthy?: boolean }> } })?._when?.and?.[0]?.path === 'facts.links.webappCabinetUrl'
    );
    expect(sendStep?.params?.inlineKeyboard).toEqual([
      [{ textTemplateKey: 'telegram:bookingMenu.my', webAppUrlFact: 'links.webappCabinetUrl' }],
      [{ textTemplateKey: 'telegram:bookingsScreen.prepare', callbackData: 'info.prepare' }],
      [{ textTemplateKey: 'telegram:bookingsScreen.address', webAppUrlFact: 'links.webappAddressUrl' }],
    ]);
  });

  it('menu.json main — одна строка: запись, дневник, меню (webapp)', () => {
    const menus = JSON.parse(readFileSync(join(dir, 'menu.json'), 'utf8')) as {
      main: Array<Array<{ textTemplateKey?: string; callbackData?: string; webAppUrlFact?: string }>>;
    };
    expect(menus.main).toHaveLength(1);
    expect(menus.main[0]).toEqual([
      { textTemplateKey: 'telegram:menu.book', callbackData: 'booking.open' },
      { textTemplateKey: 'telegram:menu.diary', webAppUrlFact: 'links.webappDiaryUrl', callbackData: 'diary.open' },
      { textTemplateKey: 'telegram:menu.more', webAppUrlFact: 'links.webappRemindersUrl', callbackData: 'menu.more' },
    ]);
  });
});
