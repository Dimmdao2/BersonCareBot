import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramWebhookBodyValidated } from './schema.js';
import { buildLinksFromBody } from './webhook.js';

vi.mock('../webappEntryToken.js', () => ({
  buildWebappEntryUrl: vi.fn(() => 'https://webapp.test/entry?t=signed'),
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
    vi.mocked(buildWebappEntryUrl).mockReturnValue('https://webapp.test/entry?t=signed');
  });

  it('prefers webappCabinetUrl as bookingUrl when webapp entry is available', () => {
    const facts = buildLinksFromBody(body);
    const links = facts.links as Record<string, string>;
    expect(links.bookingUrl).toBe(links.webappCabinetUrl);
    expect(links.bookingUrl).toContain(encodeURIComponent('/app/patient/cabinet'));
  });
});
