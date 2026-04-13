/**
 * Действия из payload `/start …` и прочих deep link (не «голый» /start).
 * Должно совпадать с разбором в `messengerStartParse.ts`, `excludeActions` в scripts.json и дедупом в incomingEventPipeline.
 */
export const MESSENGER_START_SPECIAL_ACTIONS = new Set([
  'start.link',
  'start.noticeme',
  'start.setrubitimerecord',
  'start.setphone',
  'start.set',
]);

/** @deprecated Use MESSENGER_START_SPECIAL_ACTIONS */
export const TELEGRAM_START_SPECIAL_ACTIONS = MESSENGER_START_SPECIAL_ACTIONS;
