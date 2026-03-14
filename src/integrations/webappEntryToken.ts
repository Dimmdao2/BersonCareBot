/**
 * Builds a signed webapp-entry token for the BersonCare webapp.
 * Contract: webapp/INTEGRATOR_CONTRACT.md
 */
import { createHmac } from 'node:crypto';
import { env } from '../config/env.js';
import { telegramConfig } from './telegram/config.js';

type WebappEntryTokenPayload = {
  sub: string;
  role: 'client' | 'doctor' | 'admin';
  displayName?: string;
  phone?: string;
  bindings?: { telegramId?: string };
  purpose: 'webapp-entry';
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

/**
 * Builds a signed webapp-entry token for the given Telegram user.
 * Returns null if APP_BASE_URL or INTEGRATOR_SHARED_SECRET are not set.
 */
export function buildWebappEntryToken(params: {
  chatId: number;
  displayName?: string;
}): string | null {
  const baseUrl = env.APP_BASE_URL;
  const secret = env.INTEGRATOR_SHARED_SECRET;
  if (!baseUrl || !secret) return null;

  const isAdmin =
    typeof telegramConfig.adminTelegramId === 'number' &&
    params.chatId === telegramConfig.adminTelegramId;
  const role: WebappEntryTokenPayload['role'] = isAdmin ? 'admin' : 'client';
  const sub = `tg:${params.chatId}`;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 300; // 5 minutes

  const payload: WebappEntryTokenPayload = {
    sub,
    role,
    displayName: params.displayName,
    bindings: { telegramId: String(params.chatId) },
    purpose: 'webapp-entry',
    exp,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/**
 * Returns the full webapp entry URL with signed token, or null if config is missing.
 */
export function buildWebappEntryUrl(params: {
  chatId: number;
  displayName?: string;
}): string | null {
  const token = buildWebappEntryToken(params);
  if (!token) return null;
  const baseUrl = env.APP_BASE_URL!.replace(/\/$/, '');
  return `${baseUrl}/app?t=${encodeURIComponent(token)}`;
}
