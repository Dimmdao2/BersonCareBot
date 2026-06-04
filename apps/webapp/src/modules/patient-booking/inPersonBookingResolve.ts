import type { OrganizationCatalogPort, OrganizationPort } from "@/modules/booking-engine/ports";
import type { BookingSchedulingService } from "@/modules/booking-scheduling/ports";
import { logger } from "@/app-layer/logging/logger";

export type InPersonBookingResolveDeps = {
  bookingEngine: {
    organization: Pick<OrganizationPort, "getDefaultOrganizationId">;
    catalog: Pick<OrganizationCatalogPort, "listSpecialists" | "getBranch">;
  } | null;
  bookingScheduling: Pick<
    BookingSchedulingService,
    "resolveLegacyBranchServiceId" | "resolveInPersonContext"
  > | null;
};

export class InPersonBookingResolveError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "InPersonBookingResolveError";
  }
}

export async function resolveInPersonBranchServiceId(
  deps: InPersonBookingResolveDeps,
  input: { branchServiceId?: string | null; branchId?: string | null; serviceId?: string | null },
): Promise<string> {
  const trimmed = input.branchServiceId?.trim();
  if (trimmed) {
    if (input.branchId?.trim() || input.serviceId?.trim()) {
      logger.warn(
        { branchServiceId: trimmed, branchId: input.branchId, serviceId: input.serviceId },
        "[patient-booking] in_person branchServiceId is deprecated; prefer branchId+serviceId",
      );
    } else {
      logger.info({ branchServiceId: trimmed }, "[patient-booking] in_person legacy branchServiceId input");
    }
    return trimmed;
  }

  const branchId = input.branchId?.trim();
  const serviceId = input.serviceId?.trim();
  if (!branchId || !serviceId) {
    throw new InPersonBookingResolveError("invalid_in_person_keys");
  }
  if (!deps.bookingEngine || !deps.bookingScheduling) {
    throw new InPersonBookingResolveError("booking_scheduling_unavailable");
  }

  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const specialists = await deps.bookingEngine.catalog.listSpecialists(organizationId);
  const defaultSpecialist = specialists.find((s) => s.isActive) ?? specialists[0] ?? null;

  const branchServiceId = await deps.bookingScheduling.resolveLegacyBranchServiceId({
    organizationId,
    branchId,
    serviceId,
    specialistId: defaultSpecialist?.id ?? null,
  });
  if (!branchServiceId) {
    throw new InPersonBookingResolveError("branch_service_mapping_missing");
  }
  return branchServiceId;
}

export async function resolveInPersonCityCode(
  deps: InPersonBookingResolveDeps,
  branchServiceId: string,
): Promise<string> {
  if (!deps.bookingScheduling) {
    throw new InPersonBookingResolveError("booking_scheduling_unavailable");
  }
  const ctx = await deps.bookingScheduling.resolveInPersonContext(branchServiceId);
  if (!ctx) throw new InPersonBookingResolveError("branch_service_not_found");
  const branch = await deps.bookingEngine!.catalog.getBranch(ctx.branchId);
  if (!branch?.cityCode) throw new InPersonBookingResolveError("branch_not_found");
  return branch.cityCode;
}
