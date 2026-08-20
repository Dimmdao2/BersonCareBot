import type {
  OrganizationCatalogPort,
  ServiceAvailabilityPort,
} from '@/modules/booking-engine/ports';
import type { BookingSchedulingService } from '@/modules/booking-scheduling/ports';
import type { ClinicDirectoryService } from '@/modules/clinic-directory/service';

export type InPersonBookingResolveDeps = {
  bookingEngine: {
    catalog: Pick<OrganizationCatalogPort, 'getBranch'>;
    services: Pick<ServiceAvailabilityPort, 'getService'>;
  } | null;
  bookingScheduling: Pick<
    BookingSchedulingService,
    'resolveCanonicalInPersonContext' | 'resolvePublicBookingOrganization'
  > | null;
};

export class InPersonBookingResolveError extends Error {
  /** Private diagnostic only; public routes must continue to return the neutral `code`. */
  readonly reason?: string;

  constructor(code: string, reason?: string) {
    super(code);
    this.name = 'InPersonBookingResolveError';
    this.reason = reason;
  }
}

export type ResolvedInPersonBookingContext = {
  branchId: string;
  serviceId: string;
  organizationId: string;
  cityCode?: string;
};

/** Patient-only resolver: the scheduling port proves enrollment and catalog scope in its named DB root. */
export async function resolveCurrentPatientInPersonBookingContext(
  deps: Pick<InPersonBookingResolveDeps, 'bookingScheduling'>,
  input: { branchId?: string | null; serviceId?: string | null },
): Promise<ResolvedInPersonBookingContext> {
  const branchId = input.branchId?.trim();
  const serviceId = input.serviceId?.trim();
  if (!branchId || !serviceId) {
    throw new InPersonBookingResolveError('invalid_in_person_keys');
  }
  if (!deps.bookingScheduling) {
    throw new InPersonBookingResolveError('booking_scheduling_unavailable');
  }
  const context = await deps.bookingScheduling.resolveCanonicalInPersonContext({
    branchId,
    serviceId,
  });
  if (!context) {
    throw new InPersonBookingResolveError('branch_service_mapping_missing');
  }
  return {
    branchId: context.branchId,
    serviceId: context.serviceId,
    organizationId: context.organizationId,
    ...(context.patientCatalogSnapshot
      ? { cityCode: context.patientCatalogSnapshot.branchCityCode }
      : {}),
  };
}

export type PublicInPersonBookingKeys = { branchId: string; serviceId: string };

export async function resolvePublicInPersonBookingOrganization(
  deps: InPersonBookingResolveDeps,
  input: { branchId?: string | null; serviceId?: string | null },
): Promise<{ organizationId: string; keys: PublicInPersonBookingKeys }> {
  if (!deps.bookingScheduling) {
    throw new InPersonBookingResolveError('booking_scheduling_unavailable');
  }

  const branchId = input.branchId?.trim() || null;
  const serviceId = input.serviceId?.trim() || null;
  if (Boolean(branchId) !== Boolean(serviceId)) {
    throw new InPersonBookingResolveError('invalid_in_person_keys');
  }
  if (!branchId || !serviceId) {
    throw new InPersonBookingResolveError('invalid_in_person_keys');
  }

  const keys: PublicInPersonBookingKeys = { branchId, serviceId };

  const organizationId = await deps.bookingScheduling.resolvePublicBookingOrganization(keys);
  if (!organizationId) {
    throw new InPersonBookingResolveError('ambiguous_booking_tenant', 'public_resolver_empty');
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
    branchId?: string | null;
    serviceId?: string | null;
  },
): Promise<{ organizationId: string; keys: PublicInPersonBookingKeys }> {
  const orgSlug = input.orgSlug?.trim();
  if (!orgSlug || !deps.clinicDirectory) {
    throw new InPersonBookingResolveError('ambiguous_booking_tenant', 'slug_context_unavailable');
  }
  const slugOrganizationId = await deps.clinicDirectory.resolveOrganizationIdBySlug(orgSlug);
  if (!slugOrganizationId) {
    throw new InPersonBookingResolveError('ambiguous_booking_tenant', 'slug_unknown');
  }
  const publicContext = await resolvePublicInPersonBookingOrganization(deps, input);
  if (publicContext.organizationId !== slugOrganizationId) {
    throw new InPersonBookingResolveError('ambiguous_booking_tenant', 'slug_organization_mismatch');
  }
  return publicContext;
}

export async function resolveInPersonBookingContext(
  deps: InPersonBookingResolveDeps,
  input: { branchId?: string | null; serviceId?: string | null },
): Promise<ResolvedInPersonBookingContext> {
  const branchId = input.branchId?.trim();
  const serviceId = input.serviceId?.trim();
  if (!branchId || !serviceId) {
    throw new InPersonBookingResolveError('invalid_in_person_keys');
  }
  if (!deps.bookingEngine || !deps.bookingScheduling) {
    throw new InPersonBookingResolveError('booking_scheduling_unavailable');
  }

  const [branch, service] = await Promise.all([
    deps.bookingEngine.catalog.getBranch(branchId),
    deps.bookingEngine.services.getService(serviceId),
  ]);
  if (!branch || !service) throw new InPersonBookingResolveError('branch_service_not_found');
  if (branch.organizationId !== service.organizationId) {
    throw new InPersonBookingResolveError(
      'ambiguous_booking_tenant',
      'branch_service_organization_mismatch',
    );
  }

  const organizationId = branch.organizationId;
  const context = await deps.bookingScheduling.resolveCanonicalInPersonContext({
    organizationId,
    branchId,
    serviceId,
  });
  if (!context) {
    throw new InPersonBookingResolveError('branch_service_mapping_missing');
  }
  return { branchId: context.branchId, serviceId: context.serviceId, organizationId };
}
