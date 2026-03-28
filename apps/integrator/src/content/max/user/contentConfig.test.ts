import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('max user static content', () => {
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
