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
  | { text: string; web_app: { url: string } }
  | { text: string; callback_data: string };

/** Primary CTA label from webapp `reminder_intent`. */
export function reminderIntentPrimaryLabel(intent: string | null | undefined): string {
  if (intent === 'warmup') return 'Выполнить разминку';
  return 'Начать занятие';
}

export type ReminderOpenLinkSpec =
  | { kind: 'web_app'; url: string }
  | { kind: 'url'; url: string };

function openButton(label: string, spec: ReminderOpenLinkSpec): InlineKeyboardButton {
  if (spec.kind === 'web_app') return { text: label, web_app: { url: spec.url } };
  return { text: label, url: spec.url };
}

export function buildReminderDispatchInlineKeyboard(params: {
  primaryLabel: string;
  primary: ReminderOpenLinkSpec;
  schedule: ReminderOpenLinkSpec;
  occurrenceId: string;
}): { inline_keyboard: InlineKeyboardButton[][] } {
  const { primaryLabel, primary, schedule, occurrenceId } = params;
  const rows: InlineKeyboardButton[][] = [[openButton(primaryLabel, primary)]];

  const snoozeRow: InlineKeyboardButton[] = [
    { text: 'Через 15м', callback_data: `rem_snooze:${occurrenceId}:15` },
    { text: 'Через 30м', callback_data: `rem_snooze:${occurrenceId}:30` },
  ];
  if (snoozeRow.every((b) => 'callback_data' in b && isTelegramCallbackDataWithinLimit(b.callback_data))) {
    rows.push(snoozeRow);
  }

  const doneSkipRow: InlineKeyboardButton[] = [
    { text: 'Уже выполнено', callback_data: `rem_done:${occurrenceId}` },
    { text: 'Пропущу сейчас', callback_data: `rem_skip:${occurrenceId}` },
  ];
  if (doneSkipRow.every((b) => 'callback_data' in b && isTelegramCallbackDataWithinLimit(b.callback_data))) {
    rows.push(doneSkipRow);
  }

  const muteRow: InlineKeyboardButton[] = [
    { text: 'Тишина до 8ч', callback_data: 'rem_mute:480' },
    { text: 'Тишина до завтра', callback_data: 'rem_mute:tomorrow' },
  ];
  if (muteRow.every((b) => 'callback_data' in b && isTelegramCallbackDataWithinLimit(b.callback_data))) {
    rows.push(muteRow);
  }

  rows.push([openButton('Расписание', schedule)]);

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
