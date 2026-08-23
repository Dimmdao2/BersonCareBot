/**
 * D25 — provider proof kill-set, Telegram side. Mirror of `max/maxContactProviderProof.unit.test.ts`,
 * which pinned the MAX HMAC boundary; the Telegram boundary had no test at all before this audit.
 *
 * `mapBodyToIncoming` is the only place that decides whether a Telegram-shared contact phone is
 * trusted (`webhook.ts` — `contact.user_id === message.from.id`). Everything downstream trusts
 * whatever `incoming.phone` carries: the orchestrator matches `input.phonePresent` and runs
 * `user.phone.link`, and the token-bound `webapp.phoneMessengerBind.complete` compares that same
 * phone against the webapp attempt. Owner decision 23.08.2026 («Роль бота после появления
 * приложения»): the bot is a *proof factor* of phone ownership — a forwarded contact card belonging
 * to somebody else proves nothing and must not become a trusted phone.
 *
 * Killed here: sender-owned check dropped/loosened (`contact.user_id` ignored, or `!==` weakened to a
 * truthiness/optional check), so a forwarded third-party contact is trusted as the sender's number.
 */
import { describe, expect, it } from 'vitest';
import { mapBodyToIncoming } from './webhook.js';
import type { TelegramWebhookBodyValidated } from './schema.js';

const SENDER_ID = 207278131;
const SOMEONE_ELSE_ID = 999000111;
const PHONE_WRITTEN = '+7 918 000-00-11';
const PHONE_E164 = '+79180000011';

function bodyWithContact(contact: {
  phone_number: string;
  user_id?: number;
}): TelegramWebhookBodyValidated {
  return {
    update_id: 1,
    message: {
      message_id: 42,
      text: '',
      from: { id: SENDER_ID, first_name: 'Тест' },
      chat: { id: SENDER_ID },
      contact,
    },
  } as unknown as TelegramWebhookBodyValidated;
}

function receivedPhone(update: ReturnType<typeof mapBodyToIncoming>): string | undefined {
  return update && update.kind === 'message' ? update.phone : undefined;
}

function receivedContactPhone(update: ReturnType<typeof mapBodyToIncoming>): string | undefined {
  return update && update.kind === 'message' ? update.contactPhone : undefined;
}

describe('Telegram contact provider proof (D25 kill-set)', () => {
  it('contact.user_id === message.from.id (self-owned contact) → phone is trusted and normalized', () => {
    const update = mapBodyToIncoming(
      bodyWithContact({ phone_number: PHONE_WRITTEN, user_id: SENDER_ID }),
    );
    expect(receivedPhone(update)).toBe(PHONE_E164);
    expect(receivedContactPhone(update)).toBe(PHONE_WRITTEN);
  });

  it('contact.user_id belongs to someone else (forwarded card) → phone is NOT trusted', () => {
    const update = mapBodyToIncoming(
      bodyWithContact({ phone_number: PHONE_WRITTEN, user_id: SOMEONE_ELSE_ID }),
    );
    expect(receivedPhone(update)).toBeUndefined();
    expect(receivedContactPhone(update)).toBeUndefined();
  });

  it('contact without user_id at all (manually typed card) → phone is NOT trusted', () => {
    const update = mapBodyToIncoming(bodyWithContact({ phone_number: PHONE_WRITTEN }));
    expect(receivedPhone(update)).toBeUndefined();
    expect(receivedContactPhone(update)).toBeUndefined();
  });

  it('an untrusted contact still produces an ordinary message update — it is not an error path', () => {
    const update = mapBodyToIncoming(
      bodyWithContact({ phone_number: PHONE_WRITTEN, user_id: SOMEONE_ELSE_ID }),
    );
    expect(update?.kind).toBe('message');
    expect(update && update.kind === 'message' ? update.channelId : null).toBe(String(SENDER_ID));
  });

  it('a plain message with no contact carries no phone', () => {
    const update = mapBodyToIncoming({
      update_id: 2,
      message: {
        message_id: 43,
        text: '/start',
        from: { id: SENDER_ID },
        chat: { id: SENDER_ID },
      },
    } as unknown as TelegramWebhookBodyValidated);
    expect(receivedPhone(update)).toBeUndefined();
  });
});
