import { describe, expect, it } from 'vitest';
import { parseSaasIsolationTestScenarioCliArgs } from './saasIsolationTestScenarioCliArgs';

describe('parseSaasIsolationTestScenarioCliArgs', () => {
  it('accepts execute arguments passed directly', () => {
    expect(parseSaasIsolationTestScenarioCliArgs(['--execute', '--assert-clean-only'])).toEqual({
      assertCleanOnly: true,
      proveInjectedFailureCleanup: false,
    });
  });

  it('accepts the conventional leading pnpm argument separator', () => {
    expect(
      parseSaasIsolationTestScenarioCliArgs([
        '--',
        '--execute',
        '--prove-cleanup-on-injected-failure',
      ]),
    ).toEqual({
      assertCleanOnly: false,
      proveInjectedFailureCleanup: true,
    });
  });

  it('continues to reject unknown arguments', () => {
    expect(() =>
      parseSaasIsolationTestScenarioCliArgs(['--', '--execute', '--unexpected']),
    ).toThrow('usage:');
  });

  it('continues to reject conflicting modes', () => {
    expect(() =>
      parseSaasIsolationTestScenarioCliArgs([
        '--',
        '--execute',
        '--assert-clean-only',
        '--prove-cleanup-on-injected-failure',
      ]),
    ).toThrow('saas_isolation_test_scenario_conflicting_options');
  });
});
