/**
 * Application root directory for resolving paths (migrations, content).
 * When running from apps/integrator, set BERSONCARE_APP_ROOT to that directory.
 * Defaults to process.cwd().
 */
export function getAppRoot(): string {
  const root = process.env.BERSONCARE_APP_ROOT;
  if (root && typeof root === 'string' && root.trim().length > 0) {
    return root.trim();
  }
  return process.cwd();
}
