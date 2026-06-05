import { describe, expect, it } from 'vitest';
import { parseMessengerIdTokens } from './parseMessengerIdTokens.js';

describe('parseMessengerIdTokens', () => {
  it('parses comma-separated string', () => {
    expect(parseMessengerIdTokens('1, 2; 3')).toEqual(['1', '2', '3']);
  });

  it('parses JSON array string via z.json', () => {
    expect(parseMessengerIdTokens('["10", "20"]')).toEqual(['10', '20']);
  });

  it('dedupes tokens', () => {
    expect(parseMessengerIdTokens('5,5,6')).toEqual(['5', '6']);
  });
});
