import { describe, expect, it } from 'vitest';
import { normalizeRuPhoneE164 } from './normalizeRuPhoneE164.js';

describe('integrator phone normalization', () => {
  it('normalizes common RU formats', () => {
    expect(normalizeRuPhoneE164('+7 (999) 123-45-67')).toBe('+79991234567');
    expect(normalizeRuPhoneE164('8 (495) 123-45-67')).toBe('+74951234567');
    expect(normalizeRuPhoneE164('007 800 555 35 35')).toBe('+78005553535');
  });
});
