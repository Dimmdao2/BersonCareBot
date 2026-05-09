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

/** Primary CTA label from webapp `reminder_intent`. */
export function reminderIntentPrimaryLabel(intent: string | null | undefined): string {
  if (intent === 'warmup') return 'Начать разминку';
  if (intent === 'exercises' || intent === 'stretch') return 'Выполнить упражнения';
  return 'Открыть программу';
}

export function buildReminderDispatchInlineKeyboard(params: {
  primaryLabel: string;
  openUrl: string;
  occurrenceId: string;
  /** Deeplink to patient reminders UI («Своя настройка» snooze path). */
  remindersEditUrl?: string;
}): { inline_keyboard: InlineKeyboardButton[][] } {
  const { primaryLabel, openUrl, occurrenceId, remindersEditUrl } = params;
  const rows: InlineKeyboardButton[][] = [[{ text: primaryLabel, url: openUrl }]];
  if (remindersEditUrl?.trim()) {
    rows.push([{ text: 'Своя настройка', url: remindersEditUrl.trim() }]);
  }

  const snoozeRow: InlineKeyboardButton[] = [
    { text: '15м', callback_data: `rem_snooze:${occurrenceId}:15` },
    { text: '30м', callback_data: `rem_snooze:${occurrenceId}:30` },
  ];
  if (snoozeRow.every((b) => 'callback_data' in b && isTelegramCallbackDataWithinLimit(b.callback_data))) {
    rows.push(snoozeRow);
  }

  const doneSkipRow: InlineKeyboardButton[] = [
    { text: 'Уже выполнено', callback_data: `rem_done:${occurrenceId}` },
    { text: 'Пропущу сегодня', callback_data: `rem_skip:${occurrenceId}` },
  ];
  if (doneSkipRow.every((b) => 'callback_data' in b && isTelegramCallbackDataWithinLimit(b.callback_data))) {
    rows.push(doneSkipRow);
  }

  const muteRow: InlineKeyboardButton[] = [
    { text: 'Тишина 2ч', callback_data: 'rem_mute:120' },
    { text: 'Тишина 8ч', callback_data: 'rem_mute:480' },
  ];
  if (muteRow.every((b) => 'callback_data' in b && isTelegramCallbackDataWithinLimit(b.callback_data))) {
    rows.push(muteRow);
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
