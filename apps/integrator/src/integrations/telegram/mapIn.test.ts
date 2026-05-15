import { describe, expect, it } from 'vitest';
import type { TelegramWebhookBodyValidated } from './schema.js';
import {
  incomingCallbackUpdateFromTelegramCallbackQuery,
  normalizeChannelCallbackPayload,
  normalizeTelegramMessageAction,
  telegramReplyTextToMenuAction,
} from './mapIn.js';

describe('normalizeChannelCallbackPayload (reminders + question confirm)', () => {
  it('parses rem_snooze with allowed minutes (last colon separates id and minutes)', () => {
    expect(normalizeChannelCallbackPayload('rem_snooze:occ-1:30')).toEqual({
      action: 'rem_snooze',
      reminderOccurrenceId: 'occ-1',
      reminderSnoozeMinutes: 30,
    });
    expect(normalizeChannelCallbackPayload('rem_snooze:occ:id:part:120')).toEqual({
      action: 'rem_snooze',
      reminderOccurrenceId: 'occ:id:part',
      reminderSnoozeMinutes: 120,
    });
  });

  it('parses rem_snooze for minutes in 1–720', () => {
    expect(normalizeChannelCallbackPayload('rem_snooze:occ-1:15')).toEqual({
      action: 'rem_snooze',
      reminderOccurrenceId: 'occ-1',
      reminderSnoozeMinutes: 15,
    });
  });

  it('returns raw action for rem_snooze when minutes out of range', () => {
    expect(normalizeChannelCallbackPayload('rem_snooze:occ-1:999')).toEqual({
      action: 'rem_snooze:occ-1:999',
    });
  });

  it('parses rem_mute minutes and tomorrow preset', () => {
    expect(normalizeChannelCallbackPayload('rem_mute:480')).toEqual({
      action: 'rem_mute',
      reminderMuteMinutes: 480,
    });
    expect(normalizeChannelCallbackPayload('rem_mute:tomorrow')).toEqual({
      action: 'rem_mute',
      reminderMutePreset: 'tomorrow',
    });
  });

  it('parses rem_skip and rem_skip_r', () => {
    expect(normalizeChannelCallbackPayload('rem_skip:occ-1')).toEqual({
      action: 'rem_skip',
      reminderOccurrenceId: 'occ-1',
    });
    expect(normalizeChannelCallbackPayload('rem_skip_r:occ-1:too_tired')).toEqual({
      action: 'rem_skip_r',
      reminderOccurrenceId: 'occ-1',
      skipReasonCode: 'too_tired',
    });
  });

  it('maps questions.mark_all_answered callback to admin action', () => {
    expect(normalizeChannelCallbackPayload('questions.mark_all_answered')).toEqual({
      action: 'questions.mark_all_answered',
    });
  });

  it('parses q_confirm yes/no', () => {
    expect(normalizeChannelCallbackPayload('q_confirm:yes')).toEqual({
      action: 'q_confirm:yes',
      questionConfirm: 'yes',
    });
    expect(normalizeChannelCallbackPayload('q_confirm:no')).toEqual({
      action: 'q_confirm:no',
      questionConfirm: 'no',
    });
  });
});

describe('Telegram callback_query mapper (webhook parity)', () => {
  function cq(data: string): NonNullable<TelegramWebhookBodyValidated['callback_query']> {
    return {
      id: 'cq-x',
      from: { id: 42, is_bot: false, first_name: 'U' },
      message: { message_id: 7, chat: { id: 42 } },
      data,
    };
  }

  it('propagates rem_done, rem_skip_r, and diary.symptom.entryType like normalizeChannelCallbackPayload', () => {
    expect(incomingCallbackUpdateFromTelegramCallbackQuery(cq('rem_done:occ-done'))).toMatchObject({
      kind: 'callback',
      action: 'rem_done',
      reminderOccurrenceId: 'occ-done',
      channelUserId: 42,
      messageId: 7,
      chatId: 42,
      callbackQueryId: 'cq-x',
    });
    expect(incomingCallbackUpdateFromTelegramCallbackQuery(cq('rem_skip_r:occ-s:reason'))).toMatchObject({
      action: 'rem_skip_r',
      reminderOccurrenceId: 'occ-s',
      skipReasonCode: 'reason',
    });
    expect(incomingCallbackUpdateFromTelegramCallbackQuery(cq('diary.symptom.entryType:tr-1:5:instant'))).toMatchObject({
      action: 'diary.symptom.entryType',
      trackingId: 'tr-1',
      value: 5,
      entryType: 'instant',
    });
  });

  it('returns null when chat/message/from ids are incomplete', () => {
    expect(
      incomingCallbackUpdateFromTelegramCallbackQuery({
        id: 'x',
        from: { id: 1, is_bot: false },
        message: {},
      } as NonNullable<TelegramWebhookBodyValidated['callback_query']>),
    ).toBeNull();
  });
});

describe('reply keyboard text to gated menu action', () => {
  it('treats only booking label as reply-menu action for phone gate', () => {
    expect(telegramReplyTextToMenuAction('📅 Запись на приём')).toBe('booking.open');
    expect(telegramReplyTextToMenuAction('📓 Дневник')).toBeNull();
    expect(telegramReplyTextToMenuAction('Помощник')).toBeNull();
  });
});

describe('normalizeTelegramMessageAction', () => {
  it('maps diary button text to diary.open', () => {
    expect(normalizeTelegramMessageAction('📓 Дневник')).toBe('diary.open');
    expect(normalizeTelegramMessageAction('Дневник')).toBe('diary.open');
  });

  it('maps menu.more and booking.open', () => {
    expect(normalizeTelegramMessageAction('⚙️ Меню')).toBe('menu.more');
    expect(normalizeTelegramMessageAction('📅 Запись на приём')).toBe('booking.open');
  });

  it('does not map plain text «Приложение» (reply uses WebApp button, not text)', () => {
    expect(normalizeTelegramMessageAction('Приложение')).toBe('');
  });

  it('maps /show_my_id and group form with @bot suffix', () => {
    expect(normalizeTelegramMessageAction('/show_my_id')).toBe('debug.show_my_id');
    expect(normalizeTelegramMessageAction('/show_my_id@SomeBot')).toBe('debug.show_my_id');
  });
});
