/**
 * D29 (owner, 31.07, `IDENTITY_AND_MERGE_SCHEME.md` §6) — ФИО принимается только кириллицей.
 * `isCyrillicFioInput`/`isCyrillicFioInputOrEmpty` are the single shared predicate every FIO write
 * boundary (`.refine()`s across the signup/registration/doctor-patient/admin routes) delegates to.
 */
import { describe, expect, it } from 'vitest';
import { isCyrillicFioInput, isCyrillicFioInputOrEmpty } from './fio';

describe('isCyrillicFioInput', () => {
  it('accepts a plain Cyrillic name', () => {
    expect(isCyrillicFioInput('Иван')).toBe(true);
  });

  it('accepts a hyphenated Cyrillic name', () => {
    expect(isCyrillicFioInput('Анна-Мария')).toBe(true);
  });

  it('rejects a pure Latin name', () => {
    expect(isCyrillicFioInput('Ivan')).toBe(false);
  });

  it('rejects a mixed Cyrillic/Latin name (one stray Latin letter)', () => {
    expect(isCyrillicFioInput('Ивaн')).toBe(false); // the "a" is Latin U+0061, not Cyrillic а
  });

  it('rejects empty input', () => {
    expect(isCyrillicFioInput('')).toBe(false);
  });

  it('rejects whitespace-only input', () => {
    expect(isCyrillicFioInput('   ')).toBe(false);
  });
});

describe('isCyrillicFioInputOrEmpty', () => {
  it('lets empty/whitespace-only input through (optional-field semantics)', () => {
    expect(isCyrillicFioInputOrEmpty('')).toBe(true);
    expect(isCyrillicFioInputOrEmpty('   ')).toBe(true);
  });

  it('still rejects a non-empty Latin value', () => {
    expect(isCyrillicFioInputOrEmpty('Smith')).toBe(false);
  });

  it('still accepts a non-empty Cyrillic value', () => {
    expect(isCyrillicFioInputOrEmpty('Сергеевич')).toBe(true);
  });
});
