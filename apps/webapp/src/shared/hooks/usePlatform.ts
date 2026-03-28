"use client";

import { useContext } from "react";
import type { PlatformMode } from "@/shared/lib/platform";
import { PlatformContext } from "@/shared/ui/PlatformProvider";

export function usePlatform(): PlatformMode {
  return useContext(PlatformContext);
}
