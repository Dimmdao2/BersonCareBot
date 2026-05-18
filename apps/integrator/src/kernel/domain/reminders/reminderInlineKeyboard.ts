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
  if (intent === 'warmup') return 'Начать разминку';
  return 'Начать занятие';
}

export type ReminderOpenLinkSpec =
  | { kind: 'web_app'; url: string }
  | { kind: 'url'; url: string };

function openButton(label: string, spec: ReminderOpenLinkSpec): InlineKeyboardButton {
  if (spec.kind === 'web_app') return { text: label, web_app: { url: spec.url } };
  return { text: label, url: spec.url };
}

/** Exported for handlers that build follow-up keyboards (e.g. bot reminder ack rows). */
export function reminderLinkKeyboardButton(label: string, spec: ReminderOpenLinkSpec): InlineKeyboardButton {
  return openButton(label, spec);
}

export function buildReminderDispatchInlineKeyboard(params: {
  primaryLabel: string;
  primary: ReminderOpenLinkSpec;
  schedule: ReminderOpenLinkSpec;
  mobileInstall: ReminderOpenLinkSpec;
  occurrenceId: string;
}): { inline_keyboard: InlineKeyboardButton[][] } {
  const { primaryLabel, primary, schedule, mobileInstall, occurrenceId } = params;
  const rows: InlineKeyboardButton[][] = [[openButton(primaryLabel, primary)]];

  const row20Skip: InlineKeyboardButton[] = [
    { text: 'Через 20 минут', callback_data: `rem_snooze:${occurrenceId}:20` },
    { text: 'Пропущу', callback_data: `rem_skip:${occurrenceId}` },
  ];
  if (row20Skip.every((b) => 'callback_data' in b && isTelegramCallbackDataWithinLimit(b.callback_data))) {
    rows.push(row20Skip);
  }

  const muteScheduleRow: InlineKeyboardButton[] = [
    { text: 'Тишина до завтра', callback_data: 'rem_mute:tomorrow' },
    openButton('Расписание', schedule),
  ];
  rows.push(muteScheduleRow);

  const botOffData = `rem_bot_off:${occurrenceId}`;
  if (isTelegramCallbackDataWithinLimit(botOffData)) {
    rows.push([{ text: 'Не напоминать в боте', callback_data: botOffData }]);
  }

  rows.push([openButton('Установить мобильное приложение', mobileInstall)]);

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
