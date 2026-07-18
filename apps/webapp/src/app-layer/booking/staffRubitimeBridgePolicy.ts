/**
 * C0 retires outbound Rubitime mirroring from the ordinary staff lifecycle.
 * Retained as a compatibility policy until the protected R6 route/code retirement.
 */
import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function isStaffRubitimeOutboundEnabled(
  deps: Pick<ReturnType<typeof buildAppDeps>, "rubitimeCanonicalProjection">,
): Promise<boolean> {
  // A migrated `booking_rubitime_bridge_enabled` row must not reactivate staff runtime calls.
  void deps;
  return false;
}
