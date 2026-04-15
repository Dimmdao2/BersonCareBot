import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaxUpdateValidated } from './schema.js';

vi.mock('../webappEntryToken.js', () => ({
  buildWebappEntryUrlForMax: vi.fn(),
}));

import * as entryToken from '../webappEntryToken.js';
import { buildMaxLinks } from './webhook.js';

const body = {
  message: {
    sender: { user_id: 99, first_name: 'Test' },
    recipient: { chat_id: 1 },
  },
} as MaxUpdateValidated;

describe('buildMaxLinks miniapp URL contract', () => {
  beforeEach(() => {
    vi.mocked(entryToken.buildWebappEntryUrlForMax).mockReturnValue('https://webapp.test/entry?t=signed');
  });

  it('добавляет ctx=bot и next= к ссылкам webapp', async () => {
    const result = (await buildMaxLinks(body, undefined, 'https://webapp.test')) as {
      links: Record<string, string>;
    };
    const links = result.links;
    expect(links.webappEntryUrl).toContain('ctx=bot');
    expect(links.webappHomeUrl).toContain('ctx=bot');
    expect(links.webappHomeUrl).toContain('next=');
    expect(links.webappHomeUrl).toContain(encodeURIComponent('/app/patient'));
    expect(links.webappDiaryUrl).toContain(encodeURIComponent('/app/patient/diary?tab=symptoms'));
  });
});
