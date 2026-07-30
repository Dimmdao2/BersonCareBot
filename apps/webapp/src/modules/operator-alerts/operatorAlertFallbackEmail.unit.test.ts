import { describe, expect, it } from 'vitest';
import {
  normalizeOperatorAlertFallbackEmail,
  parseOperatorAlertFallbackEmailSetting,
} from './operatorAlertFallbackEmail';

describe('operator alert fallback email', () => {
  it('normalizes one canonical address before it reaches the global setting', () => {
    expect(normalizeOperatorAlertFallbackEmail('  Operator.Alerts@Example.COM  ')).toEqual({
      ok: true,
      value: 'operator.alerts@example.com',
    });
    expect(
      parseOperatorAlertFallbackEmailSetting({ value: '  Operator.Alerts@Example.COM  ' }),
    ).toBe('operator.alerts@example.com');
  });

  it('rejects an empty, malformed, or overlong fallback destination', () => {
    expect(normalizeOperatorAlertFallbackEmail('   ')).toEqual({
      ok: false,
      error: 'required',
    });
    expect(normalizeOperatorAlertFallbackEmail('not-an-email')).toEqual({
      ok: false,
      error: 'invalid_email',
    });
    expect(normalizeOperatorAlertFallbackEmail(`${'a'.repeat(310)}@example.com`)).toEqual({
      ok: false,
      error: 'too_long',
    });
  });
});
