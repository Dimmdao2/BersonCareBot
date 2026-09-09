'use client';

/**
 * Mounts once per surface (patient/staff web-push bootstrap) to wire the native-push client bootstrap
 * into the confirmed `NativeRuntime`: idempotent reconcile on mount/resume, token-rotation reconcile from
 * the `push` listener, and validated same-surface tap navigation (M3-03). No-op in browser/PWA.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNativeRuntime } from '@/shared/hooks/useNativeRuntime';
import { addNativeAppResumeListener, addUniversalPushListener } from '@/shared/lib/nativeShellRuntime';
import type { NativePushAppKind } from '@/shared/lib/nativePush/nativePushApi';
import { reconcileNativePushSubscription, reconcileNativePushToken } from '@/shared/lib/nativePush/nativePushClient';
import { validateNativePushTapRoute } from '@/shared/lib/nativePush/nativePushTapRoute';
import type { NativeRuntimeKind } from '@/shared/lib/platform';

function isNativePushAppKind(kind: NativeRuntimeKind): kind is NativePushAppKind {
  return kind === 'therapygo_android' || kind === 'therapysto_android';
}

export function useNativePushLifecycle(): void {
  const runtime = useNativeRuntime();
  const router = useRouter();
  const kind = runtime.kind;
  const pushCapable = runtime.capabilities.push;

  useEffect(() => {
    if (!isNativePushAppKind(kind) || !pushCapable) return;

    void reconcileNativePushSubscription(kind);

    const removePushListener = addUniversalPushListener((event) => {
      if (event.kind === 'token') {
        void reconcileNativePushToken(kind, event.token);
        return;
      }
      if (event.kind === 'tap') {
        const route = validateNativePushTapRoute(kind, event.tap);
        if (route) router.push(route);
      }
    });

    const removeResumeListener = addNativeAppResumeListener(() => {
      void reconcileNativePushSubscription(kind);
    });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void reconcileNativePushSubscription(kind);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      removePushListener();
      removeResumeListener();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [kind, pushCapable, router]);
}
