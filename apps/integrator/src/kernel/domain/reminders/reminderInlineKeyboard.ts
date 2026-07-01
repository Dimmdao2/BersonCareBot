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
  return 'Начать тренировку';
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
  occurrenceId: string;
}): { inline_keyboard: InlineKeyboardButton[][] } {
  const { primaryLabel, primary, schedule, occurrenceId } = params;
  const rows: InlineKeyboardButton[][] = [[openButton(primaryLabel, primary)]];

  const snoozeMenuData = `rem_snooze_menu:${occurrenceId}`;
  const skipData = `rem_skip:${occurrenceId}`;
  const notifData = `rem_notif_settings:${occurrenceId}`;

  const row2: InlineKeyboardButton[] = [];
  if (isTelegramCallbackDataWithinLimit(snoozeMenuData)) {
    row2.push({ text: 'Напомнить позже', callback_data: snoozeMenuData });
  }
  if (isTelegramCallbackDataWithinLimit(skipData)) {
    row2.push({ text: 'Пропущу', callback_data: skipData });
  }
  if (row2.length > 0) rows.push(row2);

  const row3: InlineKeyboardButton[] = [openButton('Расписание', schedule)];
  if (isTelegramCallbackDataWithinLimit(notifData)) {
    row3.push({ text: 'Настройки уведомлений', callback_data: notifData });
  }
  rows.push(row3);

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

export function buildReminderSnoozeMenuInlineKeyboard(occurrenceId: string): { inline_keyboard: InlineKeyboardButton[][] } {
  const rows: InlineKeyboardButton[][] = [
    [
      { text: '30 минут', callback_data: `rem_snooze:${occurrenceId}:30` },
      { text: '1 час', callback_data: `rem_snooze:${occurrenceId}:60` },
    ],
    [
      { text: '2 часа', callback_data: `rem_snooze:${occurrenceId}:120` },
      { text: '3 часа', callback_data: `rem_snooze:${occurrenceId}:180` },
    ],
  ];
  const flat = rows.flat();
  if (!flat.every((b) => 'callback_data' in b && isTelegramCallbackDataWithinLimit(b.callback_data))) {
    return { inline_keyboard: [] };
  }
  return { inline_keyboard: rows };
}

export function buildReminderNotifSettingsInlineKeyboard(
  topics: Array<{ code: string; title: string; isEnabled: boolean }>,
): { inline_keyboard: InlineKeyboardButton[][] } {
  const rows: InlineKeyboardButton[][] = [];
  for (const topic of topics) {
    const callbackData = `rem_notif_toggle:${topic.code}`;
    if (!isTelegramCallbackDataWithinLimit(callbackData)) continue;
    const label = `${topic.isEnabled ? '✓' : '✗'} ${topic.title}`;
    rows.push([{ text: label, callback_data: callbackData }]);
  }
  return { inline_keyboard: rows };
}
