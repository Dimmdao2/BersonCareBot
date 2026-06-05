/**
 * Staff/admin outbound Rubitime mirror policy.
 * @see docs/BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md
 *
 * Patient rubitime-first create (`booking_slots_read_source=rubitime`) is out of scope here.
 */
import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function isStaffRubitimeOutboundEnabled(
  deps: Pick<ReturnType<typeof buildAppDeps>, "rubitimeCanonicalProjection">,
): Promise<boolean> {
  if (!deps.rubitimeCanonicalProjection?.isBridgeEnabled) return false;
  return deps.rubitimeCanonicalProjection.isBridgeEnabled();
}
