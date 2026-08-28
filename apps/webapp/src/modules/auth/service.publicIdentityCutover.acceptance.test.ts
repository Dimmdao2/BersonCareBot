import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

describe('public identity cutover: the entry-token contract is the accepted key space', () => {
  it('accepts exactly the canonical contract properties and rejects any other key', async () => {
    const contract = JSON.parse(
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../contracts/webapp-entry-token.json'),
        'utf8',
      ),
    ) as { properties: Record<string, unknown>; additionalProperties: boolean };

    // The contract is closed, so its property names ARE the accepted key space.
    expect(contract.additionalProperties).toBe(false);
    expect(Object.keys(contract.properties).sort()).toEqual(
      ['bindings', 'displayName', 'exp', 'phone', 'platformUserId', 'purpose', 'role', 'sub'].sort(),
    );

    // Every canonical key together still parses; one unknown key alongside them does not.
    const base = {
      sub: 'telegram:12345',
      role: 'client' as const,
      displayName: 'Demo',
      phone: '+79000000000',
      platformUserId: '3d54ecbf-2208-454c-9a39-c6db39a73e58',
      bindings: { telegramId: '12345' },
      purpose: 'webapp-entry' as const,
      exp: Math.floor(Date.now() / 1000) + 300,
    };
    await expect(classifyVerifiedIntegratorTokenChannel(signedToken(base))).resolves.toBe('telegram');
    await expect(
      classifyVerifiedIntegratorTokenChannel(signedToken({ ...base, someNewField: 'x' })),
    ).resolves.toBeNull();
  });
});
