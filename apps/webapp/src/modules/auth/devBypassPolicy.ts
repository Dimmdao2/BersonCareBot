export type RuntimeNodeEnv = 'development' | 'test' | 'production';

export type DevAuthBypassConfiguration = {
  nodeEnv: RuntimeNodeEnv;
  allowDevAuthBypass: boolean;
};

/**
 * Parses the security-sensitive flag without treating typos such as `TRUE`, `1`, or whitespace
 * as a disabled setting. An empty value has the same meaning as an unset optional env variable.
 */
export function parseDevAuthBypassFlag(value: string | undefined): boolean {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('ALLOW_DEV_AUTH_BYPASS must be exactly "true" or "false" when set.');
}

/** A production process must fail at config/startup time instead of merely disabling the route. */
export function assertDevAuthBypassConfiguration(input: DevAuthBypassConfiguration): void {
  if (input.nodeEnv === 'production' && input.allowDevAuthBypass) {
    throw new Error('Refusing to start: ALLOW_DEV_AUTH_BYPASS cannot be enabled in production.');
  }
}

export function isDevAuthBypassEnabled(input: DevAuthBypassConfiguration): boolean {
  return input.nodeEnv === 'development' && input.allowDevAuthBypass;
}
