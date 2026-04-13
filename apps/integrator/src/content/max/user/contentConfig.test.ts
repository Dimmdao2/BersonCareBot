import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('max user static content', () => {
  it('scripts: max.start.link — высокий priority (выше диалога/reminder freeText) и externalId из channelId', () => {
    const scripts = JSON.parse(readFileSync(join(dir, 'scripts.json'), 'utf8')) as Array<{
      id: string;
      priority?: number;
      steps?: Array<{ action?: string; params?: Record<string, unknown> }>;
    }>;
    const link = scripts.find((s) => s.id === 'max.start.link');
    expect(link?.priority).toBe(55);
    const step = link?.steps?.find((s) => s.action === 'webapp.channelLink.complete');
    expect((step?.params as { externalId?: string })?.externalId).toBe('{{input.channelId}}');
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

  it('scripts: max.assistant.open — кнопка открытия webapp через web_app (Mini App), не url', () => {
    const scripts = JSON.parse(readFileSync(join(dir, 'scripts.json'), 'utf8')) as Array<{
      id: string;
      steps?: Array<{ action?: string; params?: Record<string, unknown> }>;
    }>;
    const assistant = scripts.find((s) => s.id === 'max.assistant.open');
    expect(assistant).toBeTruthy();
    const editStep = assistant?.steps?.find(
      (step) =>
        step.action === 'message.edit'
        && (step.params as { _when?: { path?: string } })?._when?.path === 'facts.links.webappEntryUrl',
    );
    expect(editStep?.params?.inlineKeyboard).toEqual([
      [{ textTemplateKey: 'max:assistant.webapp.openButton', webAppUrlFact: 'links.webappEntryUrl' }],
      [{ text: '⬅️ Назад', callbackData: 'menu.back' }],
    ]);
  });
});
