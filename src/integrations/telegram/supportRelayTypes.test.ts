import { describe, expect, it } from 'vitest';
import {
  getMessageTypeFromTelegramMessage,
  isSupportRelayMessageType,
  SUPPORT_RELAY_MESSAGE_TYPES,
} from './supportRelayTypes.js';

describe('supportRelayTypes', () => {
  describe('getMessageTypeFromTelegramMessage', () => {
    it('returns text for message with only text', () => {
      expect(getMessageTypeFromTelegramMessage({ text: 'Hello' })).toBe('text');
    });

    it('returns photo when photo array is present', () => {
      expect(getMessageTypeFromTelegramMessage({ photo: [{}], text: 'caption' })).toBe('photo');
    });

    it('returns document when document is present', () => {
      expect(getMessageTypeFromTelegramMessage({ document: { file_id: 'x' } })).toBe('document');
    });

    it('returns voice when voice is present', () => {
      expect(getMessageTypeFromTelegramMessage({ voice: {} })).toBe('voice');
    });

    it('returns video_note when video_note is present', () => {
      expect(getMessageTypeFromTelegramMessage({ video_note: {} })).toBe('video_note');
    });

    it('returns sticker when sticker is present', () => {
      expect(getMessageTypeFromTelegramMessage({ sticker: {} })).toBe('sticker');
    });

    it('returns contact when contact is present', () => {
      expect(getMessageTypeFromTelegramMessage({ contact: {} })).toBe('contact');
    });

    it('returns location when location is present', () => {
      expect(getMessageTypeFromTelegramMessage({ location: {} })).toBe('location');
    });

    it('returns null for empty or invalid message', () => {
      expect(getMessageTypeFromTelegramMessage(null)).toBe(null);
      expect(getMessageTypeFromTelegramMessage(undefined)).toBe(null);
      expect(getMessageTypeFromTelegramMessage({})).toBe(null);
    });
  });

  describe('isSupportRelayMessageType', () => {
    it('returns true for all SUPPORT_RELAY_MESSAGE_TYPES', () => {
      for (const t of SUPPORT_RELAY_MESSAGE_TYPES) {
        expect(isSupportRelayMessageType(t)).toBe(true);
      }
    });

    it('returns false for unknown types', () => {
      expect(isSupportRelayMessageType('unknown')).toBe(false);
      expect(isSupportRelayMessageType('')).toBe(false);
    });
  });
});
