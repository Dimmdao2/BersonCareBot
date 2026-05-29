"use client";

import { useEffect } from "react";
import { capturePublicBookingAttributionFromLocation } from "@/shared/publicBook/attributionStorage";

export function PublicBookingAttributionCapture() {
  useEffect(() => {
    capturePublicBookingAttributionFromLocation();
  }, []);
  return null;
}
