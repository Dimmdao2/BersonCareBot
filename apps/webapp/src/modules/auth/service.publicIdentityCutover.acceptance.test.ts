import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const ENTRY_SECRET = 'public-identity-cutover-audit-secret';

vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getIntegratorWebappEntrySecret: vi.fn(async () => ENTRY_SECRET),
  getMaxBotApiKey: vi.fn(async () => ''),
  getTelegramBotToken: vi.fn(async () => ''),
}));

import { classifyVerifiedIntegratorTokenChannel } from './service';

function signedToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', ENTRY_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

describe('public identity cutover: retired token identities', () => {
  it('rejects a correctly signed token that carries the retired numeric identity', async () => {
    const token = signedToken({
      sub: 'telegram:12345',
      role: 'client',
      integratorUserId: 987654,
      bindings: { telegramId: '12345' },
      purpose: 'webapp-entry',
      exp: Math.floor(Date.now() / 1000) + 300,
    });

    await expect(classifyVerifiedIntegratorTokenChannel(token)).resolves.toBeNull();
  });
});
