import type {
  OrganizationCatalogPort,
  ServiceAvailabilityPort,
} from "@/modules/booking-engine/ports";
import type { BookingSchedulingService } from "@/modules/booking-scheduling/ports";
import type { ClinicDirectoryService } from "@/modules/clinic-directory/service";
import { logger } from "@/app-layer/logging/logger";

export type InPersonBookingResolveDeps = {
  bookingEngine: {
    catalog: Pick<OrganizationCatalogPort, "getBranch">;
    services: Pick<ServiceAvailabilityPort, "getService">;
  } | null;
  bookingScheduling: Pick<
    BookingSchedulingService,
    "resolveLegacyBranchServiceId" | "resolveInPersonContext" | "resolvePublicBookingOrganization"
  > | null;
};

export class InPersonBookingResolveError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "InPersonBookingResolveError";
  }
}

export type ResolvedInPersonBookingContext = {
  branchServiceId: string;
  organizationId: string;
};

export type PublicInPersonBookingKeys =
  | { branchId: string; serviceId: string; branchServiceId?: never }
  | { branchServiceId: string; branchId?: never; serviceId?: never };

export async function resolvePublicInPersonBookingOrganization(
  deps: InPersonBookingResolveDeps,
  input: { branchServiceId?: string | null; branchId?: string | null; serviceId?: string | null },
): Promise<{ organizationId: string; keys: PublicInPersonBookingKeys }> {
  if (!deps.bookingScheduling) {
    throw new InPersonBookingResolveError("booking_scheduling_unavailable");
  }

  const branchId = input.branchId?.trim() || null;
  const serviceId = input.serviceId?.trim() || null;
  const branchServiceId = input.branchServiceId?.trim() || null;
  if (Boolean(branchId) !== Boolean(serviceId)) {
    throw new InPersonBookingResolveError("invalid_in_person_keys");
  }

  // Canonical public ids are authoritative when both forms are supplied. The legacy id is never
  // allowed to steer tenant selection away from an explicit branch + service pair.
  let keys: PublicInPersonBookingKeys;
  if (branchId && serviceId) {
    keys = { branchId, serviceId };
  } else if (branchServiceId) {
    keys = { branchServiceId };
  } else {
    throw new InPersonBookingResolveError("invalid_in_person_keys");
  }

  const organizationId = await deps.bookingScheduling.resolvePublicBookingOrganization(keys);
  if (!organizationId) {
    throw new InPersonBookingResolveError("ambiguous_booking_tenant");
  }
  return { organizationId, keys };
}

/**
 * Binds public booking ids to the organization selected by the canonical `/book/{slug}` entry.
 * Missing, unknown and mismatched slugs deliberately share one neutral fail-closed error.
 */
export async function resolveSlugBoundPublicInPersonBookingOrganization(
  deps: InPersonBookingResolveDeps & { clinicDirectory: ClinicDirectoryService | null },
  input: {
    orgSlug?: string | null;
    branchServiceId?: string | null;
    branchId?: string | null;
    serviceId?: string | null;
  },
): Promise<{ organizationId: string; keys: PublicInPersonBookingKeys }> {
  const orgSlug = input.orgSlug?.trim();
  if (!orgSlug || !deps.clinicDirectory) {
    throw new InPersonBookingResolveError("ambiguous_booking_tenant");
  }
  const slugOrganizationId = await deps.clinicDirectory.resolveOrganizationIdBySlug(orgSlug);
  if (!slugOrganizationId) {
    throw new InPersonBookingResolveError("ambiguous_booking_tenant");
  }
  const publicContext = await resolvePublicInPersonBookingOrganization(deps, input);
  if (publicContext.organizationId !== slugOrganizationId) {
    throw new InPersonBookingResolveError("ambiguous_booking_tenant");
  }
  return publicContext;
}

export async function resolveInPersonBookingContext(
  deps: InPersonBookingResolveDeps,
  input: { branchServiceId?: string | null; branchId?: string | null; serviceId?: string | null },
): Promise<ResolvedInPersonBookingContext> {
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
    if (!deps.bookingScheduling) {
      throw new InPersonBookingResolveError("booking_scheduling_unavailable");
    }
    const ctx = await deps.bookingScheduling.resolveInPersonContext(trimmed);
    if (!ctx) throw new InPersonBookingResolveError("branch_service_not_found");
    return { branchServiceId: trimmed, organizationId: ctx.organizationId };
  }

  const branchId = input.branchId?.trim();
  const serviceId = input.serviceId?.trim();
  if (!branchId || !serviceId) {
    throw new InPersonBookingResolveError("invalid_in_person_keys");
  }
  if (!deps.bookingEngine || !deps.bookingScheduling) {
    throw new InPersonBookingResolveError("booking_scheduling_unavailable");
  }

  const [branch, service] = await Promise.all([
    deps.bookingEngine.catalog.getBranch(branchId),
    deps.bookingEngine.services.getService(serviceId),
  ]);
  if (!branch || !service) throw new InPersonBookingResolveError("branch_service_not_found");
  if (branch.organizationId !== service.organizationId) {
    throw new InPersonBookingResolveError("ambiguous_booking_tenant");
  }

  const organizationId = branch.organizationId;
  const branchServiceId = await deps.bookingScheduling.resolveLegacyBranchServiceId({
    organizationId,
    branchId,
    serviceId,
  });
  if (!branchServiceId) {
    throw new InPersonBookingResolveError("branch_service_mapping_missing");
  }
  return { branchServiceId, organizationId };
}

export async function resolveInPersonBranchServiceId(
  deps: InPersonBookingResolveDeps,
  input: { branchServiceId?: string | null; branchId?: string | null; serviceId?: string | null },
): Promise<string> {
  const ctx = await resolveInPersonBookingContext(deps, input);
  return ctx.branchServiceId;
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
