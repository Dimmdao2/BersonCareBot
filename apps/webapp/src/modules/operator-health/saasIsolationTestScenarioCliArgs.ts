export type SaasIsolationTestScenarioCliOptions = {
  assertCleanOnly: boolean;
  proveInjectedFailureCleanup: boolean;
};

export function parseSaasIsolationTestScenarioCliArgs(
  rawArgs: readonly string[],
): SaasIsolationTestScenarioCliOptions {
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
  const allowed = new Set([
    '--execute',
    '--assert-clean-only',
    '--prove-cleanup-on-injected-failure',
  ]);
  if (args.some((arg) => !allowed.has(arg)) || !args.includes('--execute')) {
    throw new Error('usage: --execute [--assert-clean-only|--prove-cleanup-on-injected-failure]');
  }
  const assertCleanOnly = args.includes('--assert-clean-only');
  const proveInjectedFailureCleanup = args.includes('--prove-cleanup-on-injected-failure');
  if (assertCleanOnly && proveInjectedFailureCleanup) {
    throw new Error('saas_isolation_test_scenario_conflicting_options');
  }
  return { assertCleanOnly, proveInjectedFailureCleanup };
}
