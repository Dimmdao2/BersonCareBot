/**
 * Единый разбор deep link после `/start` для Telegram и Max (см. webhook Telegram и fromMax).
 * Синхронизировать с {@link MESSENGER_START_SPECIAL_ACTIONS} и excludeActions в scripts.json.
 */

import { normalizeTelegramContactPhone } from '../telegram/mapIn.js';

export type MessengerStartParseResult = {
  action: string;
  linkSecret?: string;
  recordId?: string;
  phone?: string;
};

/** Payload после `setphone_` в deep link (текст или аргумент старта). */
export function normalizePhoneFromSetphoneStartPayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  try {
    if (/%[0-9A-Fa-f]{2}/.test(trimmed)) {
      candidate = decodeURIComponent(trimmed.replace(/\+/g, '%2B'));
    }
  } catch {
    candidate = trimmed;
  }
  const fromCandidate = normalizeTelegramContactPhone(candidate);
  if (fromCandidate) return fromCandidate;
  try {
    const decoded = decodeURIComponent(trimmed.replace(/\+/g, '%2B'));
    return normalizeTelegramContactPhone(decoded);
  } catch {
    return normalizeTelegramContactPhone(trimmed);
  }
}

/**
 * Max `bot_started` и аналоги часто присылают только аргумент без префикса `/start`.
 * Приводим к виду `/start …`, чтобы применить те же regex, что в Telegram.
 */
export function canonicalizeMessengerStartText(raw: string): string {
  const trimmed = raw.replace(/^\uFEFF+/, '').trim();
  if (!trimmed) return trimmed;
  if (/^\/start/i.test(trimmed)) return trimmed;
  if (/^link_[A-Za-z0-9_-]+$/.test(trimmed)) return `/start ${trimmed}`;
  if (/^noticeme$/i.test(trimmed)) return '/start noticeme';
  if (/^setrubitimerecord_/i.test(trimmed)) return `/start ${trimmed}`;
  if (/^setphone_/i.test(trimmed)) return `/start ${trimmed}`;
  if (/^set\w+/i.test(trimmed)) return `/start ${trimmed}`;
  return trimmed;
}

/**
 * Те же правила, что в `mapBodyToIncoming` (Telegram): noticeme, link, rubitime, setphone, start.set.
 * @param trimmedText — уже без BOM, желательно после {@link canonicalizeMessengerStartText} если источник Max.
 * @param dictionaryAction — действие из словаря текста (Telegram: normalizeTelegramMessageAction; Max: обычно '' для /start).
 */
export function parseMessengerStartCommand(
  trimmedText: string,
  dictionaryAction: string,
): MessengerStartParseResult {
  let action = dictionaryAction;
  let linkSecret: string | undefined;
  let recordId: string | undefined;
  let phone: string | undefined;

  if (/^\/start\s+noticeme$/i.test(trimmedText)) {
    action = 'start.noticeme';
  }

  const linkStart = trimmedText.match(/^\/start(?:@[^\s]+)?\s+(link_[A-Za-z0-9_-]+)$/i);
  if (linkStart?.[1]) {
    action = 'start.link';
    linkSecret = linkStart[1];
  }

  const setrubitimerecordPrefix = /^\/start\s+setrubitimerecord_/i;
  if (setrubitimerecordPrefix.test(trimmedText)) {
    action = 'start.setrubitimerecord';
    const suffix = trimmedText.replace(setrubitimerecordPrefix, '').trim().slice(0, 120);
    if (/^[A-Za-z0-9_-]+$/.test(suffix)) {
      recordId = suffix;
    }
  }

  if (!action) {
    const setphoneMatch = /^\/start\s+setphone_(.+)$/i.exec(trimmedText);
    if (setphoneMatch) {
      const normalizedSetphone = normalizePhoneFromSetphoneStartPayload(setphoneMatch[1] ?? '');
      if (normalizedSetphone) {
        action = 'start.setphone';
        phone = normalizedSetphone;
      }
    }
  }

  if (!action && /^\/start\s+set\w+/i.test(trimmedText)) {
    action = 'start.set';
  }

  return {
    action,
    ...(linkSecret !== undefined ? { linkSecret } : {}),
    ...(recordId !== undefined ? { recordId } : {}),
    ...(phone !== undefined ? { phone } : {}),
  };
}
