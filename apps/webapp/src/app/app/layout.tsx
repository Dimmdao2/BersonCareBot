import type { ReactNode } from "react";
import { Suspense } from "react";
import { PwaAppAccessGate } from "@/shared/ui/pwa/PwaAppAccessGate";

/** Область `/app/*`: в production только PWA standalone или мессенджер Mini App (см. `pwaAppAccessPolicy`). */
export default function AppAreaLayout({ children }: { children: ReactNode }) {
  const allowBrowserAccess = process.env.NODE_ENV !== "production";
  return (
    <Suspense fallback={null}>
      <PwaAppAccessGate allowBrowserAccess={allowBrowserAccess}>{children}</PwaAppAccessGate>
    </Suspense>
  );
}
