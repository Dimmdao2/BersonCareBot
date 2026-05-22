"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";

export function StandaloneRootRedirect(): null {
  const router = useRouter();

  useEffect(() => {
    if (!isStandalonePwa()) {
      return;
    }

    if (window.location.pathname !== "/") {
      return;
    }

    router.replace("/app/patient");
  }, [router]);

  return null;
}

