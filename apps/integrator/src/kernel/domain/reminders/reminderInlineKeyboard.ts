/**
 * Telegram inline_keyboard for reminder bot UX (STAGE_1 S1.T05).
 * Enforces callback_data UTF-8 byte limit (Telegram API max 64).
 */

export const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;

export function telegramCallbackDataUtf8Bytes(data: string): number {
  return Buffer.byteLength(data, 'utf8');
}

export function isTelegramCallbackDataWithinLimit(data: string): boolean {
  return telegramCallbackDataUtf8Bytes(data) <= TELEGRAM_CALLBACK_DATA_MAX_BYTES;
}

export type InlineKeyboardButton =
  | { text: string; url: string }
  | { text: string; callback_data: string };

export function buildReminderDispatchInlineKeyboard(params: {
  openUrl: string;
  occurrenceId: string;
}): { inline_keyboard: InlineKeyboardButton[][] } {
  const { openUrl, occurrenceId } = params;
  const rowOpen: InlineKeyboardButton[] = [{ text: 'Открыть видео', url: openUrl }];
  const snoozeRow: InlineKeyboardButton[] = [
    { text: 'Отложить 30м', callback_data: `rem_snooze:${occurrenceId}:30` },
    { text: 'Отложить 60м', callback_data: `rem_snooze:${occurrenceId}:60` },
    { text: 'Отложить 120м', callback_data: `rem_snooze:${occurrenceId}:120` },
  ];
  const skipRow: InlineKeyboardButton[] = [{ text: 'Пропущу сегодня', callback_data: `rem_skip:${occurrenceId}` }];

  const rows: InlineKeyboardButton[][] = [rowOpen];
  if (snoozeRow.every((b) => 'callback_data' in b && isTelegramCallbackDataWithinLimit(b.callback_data))) {
    rows.push(snoozeRow);
  }
  if (skipRow.every((b) => 'callback_data' in b && isTelegramCallbackDataWithinLimit(b.callback_data))) {
    rows.push(skipRow);
  }
  return { inline_keyboard: rows };
}

export function buildReminderSkipReasonInlineKeyboard(occurrenceId: string): { inline_keyboard: InlineKeyboardButton[][] } {
  const rows: InlineKeyboardButton[][] = [
    [
      { text: 'Боль/дискомфорт', callback_data: `rem_skip_r:${occurrenceId}:pain` },
      { text: 'Нет времени', callback_data: `rem_skip_r:${occurrenceId}:time` },
    ],
    [
      { text: 'Плохо себя чувствую', callback_data: `rem_skip_r:${occurrenceId}:fatigue` },
      { text: 'Другая причина', callback_data: `rem_skip_r:${occurrenceId}:other` },
    ],
    [{ text: 'Без комментария', callback_data: `rem_skip_r:${occurrenceId}:none` }],
  ];
  const flat = rows.flat();
  if (!flat.every((b) => 'callback_data' in b && isTelegramCallbackDataWithinLimit(b.callback_data))) {
    return { inline_keyboard: [] };
  }
  return { inline_keyboard: rows };
}
