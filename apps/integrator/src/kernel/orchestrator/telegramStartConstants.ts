/**
 * Действия из payload `/start …` и прочих deep link (не «голый» /start).
 * Должно совпадать с разбором в `mapBodyToIncoming` / `webhook.ts` и с `excludeActions` в scripts.json.
 */
export const TELEGRAM_START_SPECIAL_ACTIONS = new Set([
  'start.link',
  'start.noticeme',
  'start.setrubitimerecord',
  'start.setphone',
  'start.set',
]);
