import { describe, expect, it, vi } from 'vitest';

/**
 * C-4 negative proof (docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md): a webapp-entry token built for a
 * brand-new messenger identity must always carry role 'client', even when the chat id matches the
 * env-resident TELEGRAM_ADMIN_ID pin. That role is the sole input to
 * `INSERT INTO platform_users(..., role)` for accounts that do not exist yet
 * (webapp/pgIdentityResolution.ts) — so a token that said 'admin' here used to let a stranger whose
 * chat id sat in TELEGRAM_ADMIN_ID self-register into admin. See webappEntryToken.ts's
 * resolveRoleAndBindings doc comment for the full trace.
 */

vi.mock('../config/env.js', () => ({
  integratorWebappEntrySecret: () => 'test-webapp-entry-secret-0000',
}));

vi.mock('./telegram/config.js', () => ({
  telegramConfig: { adminTelegramId: 999001, botToken: 'test', sendMenuOnButtonPress: true },
}));

const { buildWebappEntryTokenFromSource } = await import('./webappEntryToken.js');

function decodeTokenPayload(token: string): Record<string, unknown> {
  const payloadB64 = token.split('.')[0] ?? '';
  const json = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

describe('buildWebappEntryTokenFromSource — role never comes from an admin id pin (C-4)', () => {
  it('telegram chat id equal to TELEGRAM_ADMIN_ID no longer stamps role admin', () => {
    const token = buildWebappEntryTokenFromSource(
      { source: 'telegram', chatId: 999001 },
      'https://app.example.com',
    );
    expect(token).not.toBeNull();
    const payload = decodeTokenPayload(token as string);
    expect(payload.role).toBe('client');
  });

  it('ordinary telegram chat id is client (sanity)', () => {
    const token = buildWebappEntryTokenFromSource(
      { source: 'telegram', chatId: 1 },
      'https://app.example.com',
    );
    const payload = decodeTokenPayload(token as string);
    expect(payload.role).toBe('client');
  });

  it('max source is always client (unchanged)', () => {
    const token = buildWebappEntryTokenFromSource(
      { source: 'max', maxId: 'm1' },
      'https://app.example.com',
    );
    const payload = decodeTokenPayload(token as string);
    expect(payload.role).toBe('client');
  });
});
