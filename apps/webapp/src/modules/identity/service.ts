import type { IdentityPort } from './ports';

/**
 * Composition-root factory (D15b/3): the one place that assembles the identity port from its
 * backing ports. `buildAppDeps.ts` is the only caller today; a later stage that replaces one of
 * the backing ports (e.g. an RLS-scoped `projection`) only has to change what it passes in here —
 * every existing caller of `deps.identity` keeps working unchanged.
 */
export function assembleIdentityPort(deps: IdentityPort): IdentityPort {
  return deps;
}
