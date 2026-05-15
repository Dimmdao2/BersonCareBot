import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramWebhookBodyValidated } from './schema.js';
import { buildLinksFromBody } from './webhook.js';

vi.mock('../webappEntryToken.js', () => ({
  buildWebappEntryUrl: vi.fn(() => 'https://webapp.test/app/tg?t=signed'),
}));

const body = {
  message: {
    chat: { id: 42 },
    from: { id: 7 },
  },
} as TelegramWebhookBodyValidated;

describe('buildLinksFromBody bookingUrl', () => {
  beforeEach(async () => {
    const { buildWebappEntryUrl } = await import('../webappEntryToken.js');
    vi.mocked(buildWebappEntryUrl).mockReturnValue('https://webapp.test/app/tg?t=signed');
  });

  it('prefers webappCabinetUrl as bookingUrl when webapp entry is available', async () => {
    const facts = await buildLinksFromBody(body);
    const links = facts.links as Record<string, string>;
    expect(links.bookingUrl).toBe(links.webappCabinetUrl);
    expect(links.bookingUrl).toContain(encodeURIComponent('/app/patient/cabinet'));
  });

  it('добавляет next= к ссылкам webapp без legacy ctx=bot', async () => {
    const facts = await buildLinksFromBody(body);
    const links = facts.links as Record<string, string>;
    expect(links.webappEntryUrl).toContain('/app/tg');
    expect(links.webappEntryUrl).not.toContain('ctx=bot');
    expect(links.webappHomeUrl).toContain('next=');
    expect(links.webappRemindersUrl).toContain(encodeURIComponent('/app/patient/reminders'));
  });
});
