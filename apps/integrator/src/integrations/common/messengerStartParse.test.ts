import { describe, expect, it } from 'vitest';
import {
  canonicalizeMessengerStartText,
  normalizePhoneFromSetphoneStartPayload,
  parseMessengerStartCommand,
} from './messengerStartParse.js';

describe('messengerStartParse', () => {
  it.each([
    ['/start link_a1', 'link_a1'],
    ['/start link_AB-9_z', 'link_AB-9_z'],
    ['/start@SomeBotName link_token99', 'link_token99'],
  ])('parseMessengerStartCommand extracts link secret: %s → %s', (startArg, expectedSecret) => {
    const p = parseMessengerStartCommand(startArg, '');
    expect(p.action).toBe('start.link');
    expect(p.linkSecret).toBe(expectedSecret);
  });

  it('canonicalizeMessengerStartText strips BOM then prepends /start for bare link', () => {
    expect(canonicalizeMessengerStartText('\uFEFF\uFEFFlink_afterBom')).toBe('/start link_afterBom');
  });

  it('parseMessengerStartCommand decodes percent-encoded setphone payload', () => {
    const startArg = '/start setphone_%2B79001234567';
    const p = parseMessengerStartCommand(startArg, '');
    expect(p.action).toBe('start.setphone');
    expect(p.phone).toBe('+79001234567');
  });

  it('canonicalizeMessengerStartText prepends /start for bare link token', () => {
    expect(canonicalizeMessengerStartText('link_abc')).toBe('/start link_abc');
  });

  it('canonicalizeMessengerStartText leaves /start as-is', () => {
    expect(canonicalizeMessengerStartText('/start noticeme')).toBe('/start noticeme');
  });

  it('normalizePhoneFromSetphoneStartPayload accepts digits payload', () => {
    const n = normalizePhoneFromSetphoneStartPayload('79001234567');
    expect(n).toBe('+79001234567');
  });

  it('normalizePhoneFromSetphoneStartPayload returns null for invalid percent escapes without throwing', () => {
    expect(normalizePhoneFromSetphoneStartPayload('%')).toBeNull();
    expect(normalizePhoneFromSetphoneStartPayload('%GG')).toBeNull();
  });

  it('parseMessengerStartCommand matches Telegram noticeme', () => {
    const p = parseMessengerStartCommand('/start noticeme', '');
    expect(p.action).toBe('start.noticeme');
  });

  it('parseMessengerStartCommand extracts rubitime recordId', () => {
    const p = parseMessengerStartCommand('/start setrubitimerecord_rec1_x', '');
    expect(p.action).toBe('start.setrubitimerecord');
    expect(p.recordId).toBe('rec1_x');
  });

  it('parseMessengerStartCommand extracts setphone when dictionary action empty', () => {
    const startArg = '/start setphone_' + String.fromCharCode(43) + '79001234567';
    const p = parseMessengerStartCommand(startArg, '');
    expect(p.action).toBe('start.setphone');
    expect(p.phone).toBe('+79001234567');
  });

  it('parseMessengerStartCommand sets start.set for generic setword', () => {
    const p = parseMessengerStartCommand('/start setanything', '');
    expect(p.action).toBe('start.set');
  });
});
