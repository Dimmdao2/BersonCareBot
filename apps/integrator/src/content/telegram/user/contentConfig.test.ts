import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('telegram user static content', () => {
  it('replyMenu: одна строка — запись, дневник, меню', () => {
    const rows = JSON.parse(readFileSync(join(dir, 'replyMenu.json'), 'utf8')) as Array<
      Array<{ textTemplateKey: string }>
    >;
    expect(rows).toHaveLength(1);
    const row0 = rows[0];
    expect(row0).toBeDefined();
    expect(row0!.map((b) => b.textTemplateKey)).toEqual([
      'telegram:menu.book',
      'telegram:menu.diary',
      'telegram:menu.more',
    ]);
  });

  it('scripts: telegram.booking.open — под текстом записи три inline-кнопки (кабинет webapp, подготовка, адрес webapp)', () => {
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
      [
        { textTemplateKey: 'telegram:bookingMenu.my', webAppUrlFact: 'links.webappCabinetUrl' },
        { textTemplateKey: 'telegram:bookingsScreen.prepare', callbackData: 'info.prepare' },
        { textTemplateKey: 'telegram:bookingsScreen.address', webAppUrlFact: 'links.webappAddressUrl' },
      ],
    ]);
  });
});
