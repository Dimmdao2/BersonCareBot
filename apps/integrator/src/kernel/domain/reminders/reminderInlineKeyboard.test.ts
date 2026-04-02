import { describe, expect, it } from 'vitest';
import {
  buildReminderDispatchInlineKeyboard,
  buildReminderSkipReasonInlineKeyboard,
  isTelegramCallbackDataWithinLimit,
  telegramCallbackDataUtf8Bytes,
} from './reminderInlineKeyboard.js';

describe('reminderInlineKeyboard', () => {
  it('keeps dispatch rows when occurrence id is a typical UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const kb = buildReminderDispatchInlineKeyboard({
      openUrl: 'https://example.com/app',
      occurrenceId: id,
    });
    expect(kb.inline_keyboard.length).toBe(3);
    const snooze = kb.inline_keyboard[1];
    expect(snooze?.[0]).toMatchObject({ callback_data: `rem_snooze:${id}:30` });
  });

  it('drops snooze and skip rows when callback_data would exceed Telegram byte limit', () => {
    const longId = `x${'a'.repeat(80)}`;
    expect(isTelegramCallbackDataWithinLimit(`rem_snooze:${longId}:120`)).toBe(false);
    const kb = buildReminderDispatchInlineKeyboard({
      openUrl: 'https://example.com/app',
      occurrenceId: longId,
    });
    expect(kb.inline_keyboard.length).toBe(1);
    expect(kb.inline_keyboard[0]?.[0]).toMatchObject({ url: 'https://example.com/app' });
  });

  it('reports UTF-8 byte length for emoji in callback_data', () => {
    const s = 'rem_snooze:occ:30';
    expect(telegramCallbackDataUtf8Bytes(s)).toBe(Buffer.byteLength(s, 'utf8'));
  });

  it('returns empty skip-reason keyboard when presets do not fit', () => {
    const longId = `y${'b'.repeat(90)}`;
    const kb = buildReminderSkipReasonInlineKeyboard(longId);
    expect(kb.inline_keyboard.length).toBe(0);
  });
});
