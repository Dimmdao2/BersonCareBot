import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it('keeps +7XXXXXXXXXX unchanged', () => {
    expect(normalizePhone('+79991234567')).toBe('+79991234567');
  });

  it('normalizes 8XXXXXXXXXX to +7XXXXXXXXXX', () => {
    expect(normalizePhone('89991234567')).toBe('+79991234567');
  });

  it('normalizes 7XXXXXXXXXX to +7XXXXXXXXXX', () => {
    expect(normalizePhone('79991234567')).toBe('+79991234567');
  });

  it('removes spaces and punctuation before normalization', () => {
    expect(normalizePhone('+7 (999) 123-45-67')).toBe('+79991234567');
    expect(normalizePhone('8 (999) 123-45-67')).toBe('+79991234567');
  });

  it('returns null for unsupported formats', () => {
    expect(normalizePhone('+1 202 555 01 23')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});
