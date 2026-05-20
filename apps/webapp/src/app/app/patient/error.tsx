"use client";

import { routePaths } from "@/app-layer/routes/paths";
import { SegmentRouteError } from "@/shared/ui/SegmentRouteError";

export default function PatientSegmentError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentRouteError {...props} backFallbackHref={routePaths.patient} />;
}
