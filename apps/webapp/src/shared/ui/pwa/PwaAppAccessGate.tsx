"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import {
  buildPwaInstallLandingRedirectUrl,
  shouldAllowPwaAppShellAccess,
} from "@/shared/lib/pwa/pwaAppAccessPolicy";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";

type Props = {
  children: ReactNode;
  allowBrowserAccess: boolean;
};

/** Redirects browser `/app/*` visits to marketing install landing; PWA standalone and Mini App pass through. */
export function PwaAppAccessGate({ children, allowBrowserAccess }: Props) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const allowed = shouldAllowPwaAppShellAccess({
      pathname,
      search,
      standalone: isStandalonePwa(),
      messengerMiniApp: isMessengerMiniAppHost(),
      allowBrowserAccess,
    });
    if (allowed) return;

    const target = buildPwaInstallLandingRedirectUrl(pathname, search);
    router.replace(target);
  }, [allowBrowserAccess, pathname, router, searchParams]);

  return children;
}
