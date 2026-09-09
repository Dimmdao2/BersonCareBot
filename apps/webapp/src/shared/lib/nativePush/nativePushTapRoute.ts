/**
 * Client-side mirror of the Android `UniversalPushPlugin` tap validators (`validSurface`/`validKind`/
 * `validRoute`, see `apps/mobile-shell/README.md`). Independent double-check before Next navigation:
 * mismatch, external/protocol-relative/admin/cross-surface/malformed routes are ignored, never navigated.
 */
import type { NativePushTapEvent } from '@/shared/lib/nativeShellRuntime';
import type { NativePushAppKind } from '@/shared/lib/nativePush/nativePushApi';

const NOTIFICATION_KINDS = new Set(['message', 'reminder', 'call']);

/** No `:` in the charset — rules out `http:`/`https:`/any scheme by construction, not just by prefix check. */
const SAFE_ROUTE_PATTERN = /^\/[A-Za-z0-9/_?=&.-]*$/;

function surfaceForKind(kind: NativePushAppKind): 'therapygo' | 'therapysto' {
  return kind === 'therapygo_android' ? 'therapygo' : 'therapysto';
}

function allowedRoutePrefixes(kind: NativePushAppKind): readonly string[] {
  return kind === 'therapygo_android' ? (['/app/patient'] as const) : (['/app/doctor', '/app/settings', '/app/account'] as const);
}

function matchesAllowedPrefix(route: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`) || route.startsWith(`${prefix}?`));
}

/** Returns the sanitized same-surface route, or `null` if the tap event fails any check. */
export function validateNativePushTapRoute(kind: NativePushAppKind, event: NativePushTapEvent): string | null {
  if (event.pushSurface !== surfaceForKind(kind)) return null;
  if (!NOTIFICATION_KINDS.has(event.notificationKind)) return null;
  const route = event.route;
  if (route.length === 0 || route.length > 256) return null;
  if (route.startsWith('//')) return null;
  if (!SAFE_ROUTE_PATTERN.test(route)) return null;
  if (route.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  if (!matchesAllowedPrefix(route, allowedRoutePrefixes(kind))) return null;
  return route;
}
