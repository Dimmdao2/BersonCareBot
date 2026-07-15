export function isDevAuthBypassEnabled(input: {
  nodeEnv: 'development' | 'test' | 'production';
  allowDevAuthBypass: boolean;
}): boolean {
  return input.nodeEnv === 'development' && input.allowDevAuthBypass;
}
