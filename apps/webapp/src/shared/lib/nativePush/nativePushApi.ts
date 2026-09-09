/**
 * Thin fetch wrappers over the accepted authenticated native-push routes. Runtime kind fixes the route —
 * callers pass only the confirmed native kind, never an app id they chose themselves (M6-03/M6-09).
 */
import type { NativeRuntimeKind } from '@/shared/lib/platform';

export type NativePushAppKind = Extract<NativeRuntimeKind, 'therapygo_android' | 'therapysto_android'>;

function routeFor(kind: NativePushAppKind): string {
  return kind === 'therapygo_android' ? '/api/patient/native-push' : '/api/account/native-push';
}

export type NativePushStatusResponse = {
  ok: boolean;
  active: boolean;
  providers: string[];
  projectId: string | null;
  runtime?: 'unavailable';
};

export async function fetchNativePushStatus(kind: NativePushAppKind): Promise<NativePushStatusResponse | null> {
  try {
    const res = await fetch(routeFor(kind), { credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    if (body.ok !== true) return null;
    return {
      ok: true,
      active: body.active === true,
      providers: Array.isArray(body.providers) ? (body.providers as string[]) : [],
      projectId: typeof body.projectId === 'string' ? body.projectId : null,
      runtime: body.runtime === 'unavailable' ? 'unavailable' : undefined,
    };
  } catch {
    return null;
  }
}

export type RegisterNativePushOutcome = 'ok' | 'installation_conflict' | 'unavailable' | 'error';

export async function registerNativePushInstallation(
  kind: NativePushAppKind,
  input: { installationId: string; token: string },
): Promise<RegisterNativePushOutcome> {
  try {
    const res = await fetch(routeFor(kind), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId: input.installationId, token: input.token, provider: 'rustore' }),
    });
    if (res.ok) return 'ok';
    if (res.status === 409) return 'installation_conflict';
    if (res.status === 503) return 'unavailable';
    return 'error';
  } catch {
    return 'error';
  }
}

/** Best-effort — never throws; caller (logout door, disable action) treats every outcome the same. */
export async function revokeNativePushInstallation(
  kind: NativePushAppKind,
  input: { installationId: string; provider?: string },
): Promise<boolean> {
  try {
    const res = await fetch(routeFor(kind), {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId: input.installationId, provider: input.provider ?? 'rustore' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
