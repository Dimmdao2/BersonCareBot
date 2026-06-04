"use client";

import { SegmentRouteError } from "@/shared/ui/patient/SegmentRouteError";

export default function AppShellSegmentError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentRouteError {...props} />;
}
