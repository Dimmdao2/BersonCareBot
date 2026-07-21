import { describe, expect, it } from 'vitest';
import {
  assertDevAuthBypassConfiguration,
  isDevAuthBypassEnabled,
  parseDevAuthBypassFlag,
} from './devBypassPolicy';

describe('parseDevAuthBypassFlag', () => {
  it('defaults an unset or empty optional flag to false', () => {
    expect(parseDevAuthBypassFlag(undefined)).toBe(false);
    expect(parseDevAuthBypassFlag('')).toBe(false);
  });

  it('accepts only exact boolean spellings', () => {
    expect(parseDevAuthBypassFlag('true')).toBe(true);
    expect(parseDevAuthBypassFlag('false')).toBe(false);
  });

  it.each(['TRUE', '1', 'yes', ' true ', 'false '])(
    'rejects ambiguous value %j instead of silently disabling the guard',
    (value) => {
      expect(() => parseDevAuthBypassFlag(value)).toThrow(/must be exactly/);
    },
  );
});

describe('assertDevAuthBypassConfiguration', () => {
  it('rejects an enabled production bypass', () => {
    expect(() =>
      assertDevAuthBypassConfiguration({
        nodeEnv: 'production',
        allowDevAuthBypass: true,
      }),
    ).toThrow(/cannot be enabled in production/);
  });

  it('accepts production with the flag disabled and development with it enabled', () => {
    expect(() =>
      assertDevAuthBypassConfiguration({
        nodeEnv: 'production',
        allowDevAuthBypass: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertDevAuthBypassConfiguration({
        nodeEnv: 'development',
        allowDevAuthBypass: true,
      }),
    ).not.toThrow();
  });

  it('preserves test configuration without enabling the runtime bypass', () => {
    expect(() =>
      assertDevAuthBypassConfiguration({ nodeEnv: 'test', allowDevAuthBypass: true }),
    ).not.toThrow();
    expect(isDevAuthBypassEnabled({ nodeEnv: 'test', allowDevAuthBypass: true })).toBe(false);
  });
});

describe('isDevAuthBypassEnabled', () => {
  it('allows bypass only in development with the explicit flag', () => {
    expect(isDevAuthBypassEnabled({ nodeEnv: 'development', allowDevAuthBypass: true })).toBe(true);
    expect(isDevAuthBypassEnabled({ nodeEnv: 'development', allowDevAuthBypass: false })).toBe(
      false,
    );
    expect(isDevAuthBypassEnabled({ nodeEnv: 'test', allowDevAuthBypass: true })).toBe(false);
    expect(isDevAuthBypassEnabled({ nodeEnv: 'production', allowDevAuthBypass: true })).toBe(false);
  });
});
