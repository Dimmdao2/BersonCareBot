import { describe, expect, it } from 'vitest';
import {
  buildReminderDispatchInlineKeyboard,
  buildReminderSkipReasonInlineKeyboard,
  isTelegramCallbackDataWithinLimit,
  reminderIntentPrimaryLabel,
  telegramCallbackDataUtf8Bytes,
} from './reminderInlineKeyboard.js';

describe('reminderIntentPrimaryLabel', () => {
  it('maps intents to product CTA copy', () => {
    expect(reminderIntentPrimaryLabel('warmup')).toBe('Выполнить разминку');
    expect(reminderIntentPrimaryLabel('exercises')).toBe('Начать занятие');
    expect(reminderIntentPrimaryLabel('stretch')).toBe('Начать занятие');
    expect(reminderIntentPrimaryLabel('generic')).toBe('Начать занятие');
    expect(reminderIntentPrimaryLabel(null)).toBe('Начать занятие');
  });
});

describe('reminderInlineKeyboard', () => {
  it('keeps dispatch rows when occurrence id is a typical UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const kb = buildReminderDispatchInlineKeyboard({
      primaryLabel: 'Открыть программу',
      openUrl: 'https://example.com/app',
      occurrenceId: id,
    });
    expect(kb.inline_keyboard.length).toBeGreaterThanOrEqual(3);
    const snooze = kb.inline_keyboard[1];
    expect(snooze?.[0]).toMatchObject({ callback_data: `rem_snooze:${id}:15` });
  });

  it('drops snooze and skip rows when callback_data would exceed Telegram byte limit', () => {
    const longId = `x${'a'.repeat(80)}`;
    expect(isTelegramCallbackDataWithinLimit(`rem_snooze:${longId}:120`)).toBe(false);
    const kb = buildReminderDispatchInlineKeyboard({
      primaryLabel: 'Открыть программу',
      openUrl: 'https://example.com/app',
      occurrenceId: longId,
    });
    // Primary row + global mute row (no occurrence id in callback); snooze/done/skip omitted.
    expect(kb.inline_keyboard.length).toBe(2);
    expect(kb.inline_keyboard[0]?.[0]).toMatchObject({ url: 'https://example.com/app' });
    expect(kb.inline_keyboard[1]?.[0]).toMatchObject({ callback_data: 'rem_mute:120' });
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
