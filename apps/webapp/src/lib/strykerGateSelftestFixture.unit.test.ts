import { describe, expect, it } from 'vitest';
import { classifySelftestProbe } from './strykerGateSelftestFixture';

describe('stryker gate selftest fixture', () => {
  it('classifies empty vs non-empty input', () => {
    expect(classifySelftestProbe('')).toBe('empty');
    expect(classifySelftestProbe('x')).toBe('other');
  });
});
