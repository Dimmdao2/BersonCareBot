'use client';

import { useEffect } from 'react';
import { isNativeShellActive } from '@/shared/lib/nativeShellRuntime';
import { markStaffPwaInstalled } from '@/shared/lib/pwa/staffPwaInstallState';
import { registerPatientServiceWorker } from '@/shared/lib/webPush/registerPatientServiceWorker';

/** Staff shell mount: registers `public/sw.js` through the one shared door (no-op in Mini App/native shell, M1-07). */
export function StaffPwaBootstrap() {
  useEffect(() => {
    const nativeShell = isNativeShellActive();
    const onAppInstalled = () => {
      markStaffPwaInstalled();
    };
    if (!nativeShell) window.addEventListener('appinstalled', onAppInstalled);

    const t = window.setTimeout(() => {
      void registerPatientServiceWorker();
    }, 0);

    return () => {
      window.clearTimeout(t);
      if (!nativeShell) window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  return null;
}
