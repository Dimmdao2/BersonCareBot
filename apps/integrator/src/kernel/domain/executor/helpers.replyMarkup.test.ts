import { describe, expect, it } from 'vitest';
import type { DomainContext } from '../../contracts/index.js';
import { buildReplyMarkup } from './helpers.js';

const ctx: DomainContext = {
  event: {
    type: 'message.received',
    meta: { eventId: 'e1', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
    payload: {},
  },
  nowIso: '2026-01-01T00:00:00.000Z',
  values: {},
  base: {
    actor: { isAdmin: false },
    identityLinks: [],
    facts: { links: { webappHomeUrl: 'https://app.example/tg?t=abc' } },
  },
};

describe('buildReplyMarkup urlFact', () => {
  it('inline keyboard urlFact resolves to ordinary url button', async () => {
    const markup = await buildReplyMarkup({
      params: {
        inlineKeyboard: [[{ text: 'Open', urlFact: 'links.webappHomeUrl' }]],
      },
      ctx,
      templatePort: undefined,
    }) as { inline_keyboard: Array<Array<{ url?: string; web_app?: { url: string } }>> };
    expect(markup.inline_keyboard[0]?.[0]?.url).toBe('https://app.example/tg?t=abc');
    expect(markup.inline_keyboard[0]?.[0]?.web_app).toBeUndefined();
  });

  it('webAppUrlFact still produces web_app button', async () => {
    const markup = await buildReplyMarkup({
      params: {
        inlineKeyboard: [[{ text: 'App', webAppUrlFact: 'links.webappHomeUrl' }]],
      },
      ctx,
      templatePort: undefined,
    }) as { inline_keyboard: Array<Array<{ web_app?: { url: string } }>> };
    expect(markup.inline_keyboard[0]?.[0]?.web_app?.url).toBe('https://app.example/tg?t=abc');
  });
});
