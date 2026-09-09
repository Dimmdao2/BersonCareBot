'use client';

/**
 * The single logout/sign-out door (`/api/auth/logout`), shared by patient and staff surfaces (previously
 * four separate copies of the same plain form). In native runtime it performs a best-effort authenticated
 * revoke of the device's native-push installation before the form submits; browser logout is unchanged —
 * the form posts natively with no JS required (M3-03). Offboarding stays server-owned; this never blocks
 * or fails the actual sign-out.
 */
import type { FormEvent, ReactNode } from 'react';
import { useNativeRuntime } from '@/shared/hooks/useNativeRuntime';
import { revokeNativePushBeforeLogout } from '@/shared/lib/nativePush/nativePushClient';

const NATIVE_REVOKE_TIMEOUT_MS = 1500;

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

export function LogoutForm({ children, className }: { children: ReactNode; className?: string }) {
  const runtime = useNativeRuntime();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (runtime.kind === 'browser') return;
    event.preventDefault();
    const form = event.currentTarget;
    void withTimeout(revokeNativePushBeforeLogout(runtime.kind), NATIVE_REVOKE_TIMEOUT_MS).finally(() => {
      form.submit();
    });
  };

  return (
    <form action="/api/auth/logout" method="post" className={className} onSubmit={onSubmit}>
      {children}
    </form>
  );
}
