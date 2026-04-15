import { describe, expect, it } from 'vitest';
import { resolveLinkedPhoneNormalized } from './linkedPhoneSource.js';

describe('resolveLinkedPhoneNormalized', () => {
  it('public_then_contacts prefers public when both set', () => {
    expect(resolveLinkedPhoneNormalized('public_then_contacts', '+70001112233', '+79990001122')).toBe('+70001112233');
  });

  it('public_then_contacts falls back to legacy when public empty', () => {
    expect(resolveLinkedPhoneNormalized('public_then_contacts', null, '+79990001122')).toBe('+79990001122');
    expect(resolveLinkedPhoneNormalized('public_then_contacts', '   ', '+79990001122')).toBe('+79990001122');
  });

  it('public_only ignores legacy', () => {
    expect(resolveLinkedPhoneNormalized('public_only', null, '+79990001122')).toBeNull();
    expect(resolveLinkedPhoneNormalized('public_only', '', '+79990001122')).toBeNull();
  });

  it('contacts_only ignores public', () => {
    expect(resolveLinkedPhoneNormalized('contacts_only', '+70001112233', null)).toBeNull();
    expect(resolveLinkedPhoneNormalized('contacts_only', '+70001112233', '')).toBeNull();
    expect(resolveLinkedPhoneNormalized('contacts_only', null, '+79990001122')).toBe('+79990001122');
  });
});
