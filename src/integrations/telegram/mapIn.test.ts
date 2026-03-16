import { describe, expect, it } from 'vitest';
import { normalizeTelegramMessageAction } from './mapIn.js';

describe('normalizeTelegramMessageAction', () => {
  it('maps diary button text to diary.open', () => {
    expect(normalizeTelegramMessageAction('📓 Дневник')).toBe('diary.open');
    expect(normalizeTelegramMessageAction('Дневник')).toBe('diary.open');
  });

  it('maps menu.more and booking.open', () => {
    expect(normalizeTelegramMessageAction('⚙️ Меню')).toBe('menu.more');
    expect(normalizeTelegramMessageAction('📅 Запись на приём')).toBe('booking.open');
  });
});
