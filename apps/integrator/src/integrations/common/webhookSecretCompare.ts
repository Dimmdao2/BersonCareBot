import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time webhook secret check, shared by Telegram and MAX inbound webhooks (see
 * `telegram/webhook.ts` and `max/webhook.ts`). A plain `!==` string compare short-circuits on the
 * first mismatched byte, so response timing leaks how many leading characters of a guessed secret
 * are correct — this makes the secret recoverable byte-by-byte. `timingSafeEqual` always walks the
 * full buffer, so timing carries no signal; it throws on unequal-length buffers, so length is
 * checked separately before calling it.
 */
export function isWebhookSecretValid(
  receivedHeader: string | string[] | undefined,
  expectedSecret: string | undefined,
): boolean {
  if (typeof receivedHeader !== 'string' || receivedHeader.length === 0) return false;
  if (typeof expectedSecret !== 'string' || expectedSecret.length === 0) return false;
  const received = Buffer.from(receivedHeader, 'utf8');
  const expected = Buffer.from(expectedSecret, 'utf8');
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
