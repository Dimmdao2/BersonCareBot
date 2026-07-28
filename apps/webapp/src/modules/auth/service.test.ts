import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { encodeBase64Url } from '@/shared/utils/base64url';
import { exchangeIntegratorToken } from './service';

const TEST_ENTRY_SECRET = 'test-integrator-entry-secret';
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getIntegratorWebappEntrySecret: async () => TEST_ENTRY_SECRET,
  getTelegramBotToken: async () => '',
  getMaxBotApiKey: async () => '',
}));

const sessionCookieSourcePath = join(dirname(fileURLToPath(import.meta.url)), 'sessionCookie.ts');

function signPayload(payload: string): string {
  return createHmac('sha256', TEST_ENTRY_SECRET).update(payload).digest('base64url');
}

describe('auth service', () => {
  it('SESSION_SLIDING_TTL_SECONDS (idle TTL) is 30 days for client (non-staff) sessions (S2 remedy 2026-07-25)', () => {
    const src = readFileSync(sessionCookieSourcePath, 'utf8');
    expect(src).toMatch(
      /const\s+SESSION_SLIDING_TTL_SECONDS\s*=\s*60\s*\*\s*60\s*\*\s*24\s*\*\s*30/,
    );
  });

  it('SESSION_ABSOLUTE_MAX_AGE_SECONDS (hard ceiling) is 90 days for client (non-staff) sessions — the pre-remedy TTL value, now the max age', () => {
    const src = readFileSync(sessionCookieSourcePath, 'utf8');
    expect(src).toMatch(
      /const\s+SESSION_ABSOLUTE_MAX_AGE_SECONDS\s*=\s*60\s*\*\s*60\s*\*\s*24\s*\*\s*90/,
    );
  });

  it('returns null for malformed signed integrator token payload', async () => {
    const payload = encodeBase64Url('not-json');
    const signature = signPayload(payload);
    const token = `${payload}.${signature}`;

    await expect(exchangeIntegratorToken(token)).resolves.toBeNull();
  });
});
