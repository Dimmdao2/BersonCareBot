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
      { textTemplateKey: 'telegram:menu.more', webAppUrlFact: 'links.webappHomeUrl' },
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

  it('scripts: telegram.assistant.open — кнопка открытия webapp через web_app (Mini App), не url', () => {
    const scripts = JSON.parse(readFileSync(join(dir, 'scripts.json'), 'utf8')) as Array<{
      id: string;
      steps?: Array<{ action?: string; params?: Record<string, unknown> }>;
    }>;
    const assistant = scripts.find((s) => s.id === 'telegram.assistant.open');
    expect(assistant).toBeTruthy();
    const editStep = assistant?.steps?.find(
      (step) =>
        step.action === 'message.edit'
        && (step.params as { _when?: { path?: string } })?._when?.path === 'facts.links.webappEntryUrl',
    );
    expect(editStep?.params?.inlineKeyboard).toEqual([
      [{ textTemplateKey: 'telegram:assistant.webapp.openButton', webAppUrlFact: 'links.webappEntryUrl' }],
      [{ text: '⬅️ Назад', callbackData: 'menu.back' }],
    ]);
  });
});
