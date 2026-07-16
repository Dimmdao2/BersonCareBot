/** Disable Next link prefetch only for the tenant-runtime-free Global System Health shell. */
export function doctorShellLinkPrefetch(enableTenantRuntime?: boolean): false | undefined {
  return enableTenantRuntime === false ? false : undefined;
}
