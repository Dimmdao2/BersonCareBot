'use client';

import { useContext } from 'react';
import type { NativeRuntimeSnapshot } from '@/shared/lib/platform';
import { NativeRuntimeContext } from '@/shared/ui/PlatformProvider';

/** Product pages consume this, never `window.Capacitor` directly (M3-01). */
export function useNativeRuntime(): NativeRuntimeSnapshot {
  return useContext(NativeRuntimeContext);
}
