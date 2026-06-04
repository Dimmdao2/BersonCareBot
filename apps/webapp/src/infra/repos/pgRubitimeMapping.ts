import { and, asc, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import type { BookingCatalogPort } from "@/modules/booking-catalog/ports";
import type { ServiceAvailabilityPort } from "@/modules/booking-engine/ports";
import type { BookingSchedulingPort } from "@/modules/booking-scheduling/ports";
import { computeRubitimeMappingStatus } from "@/modules/rubitime-mapping/computeStatus";
import type { ListRubitimeMappingQuery, RubitimeMappingPort } from "@/modules/rubitime-mapping/ports";
import type {
  LinkRubitimeMappingInput,
  LinkRubitimeMappingResult,
  RubitimeMappingRow,
  RubitimeMappingSummary,
} from "@/modules/rubitime-mapping/types";
import {
  beBranches,
  beClinicServices,
  beExternalEntityMappings,
  beServiceLocationAvailability,
  beSpecialistServiceAvailability,
  beSpecialists,
} from "../../../db/schema/bookingEngine";

type LegacyBranchServiceRow = {
  id: string;
  branch_id: string;
  service_id: string;
  specialist_id: string;
  rubitime_service_id: string;
  is_active: boolean;
  branch_title: string;
  specialist_name: string;
  service_title: string;
  service_duration: number;
  service_price_minor: number;
};

export function createPgRubitimeMappingPort(deps: {
  bookingCatalogPort: BookingCatalogPort;
  upsertSpecialistServiceAvailability: ServiceAvailabilityPort["upsertSpecialistServiceAvailability"];
  resolveLegacyBranchServiceId: BookingSchedulingPort["resolveLegacyBranchServiceId"];
}): RubitimeMappingPort {
  return {
    listMappings(query) {
      return listMappingsInternal(query, deps.resolveLegacyBranchServiceId);
    },
    linkMapping(input) {
      return linkMappingInternal(input, deps);
    },
  };
}

async function listMappingsInternal(
  query: ListRubitimeMappingQuery,
  resolveLegacyBranchServiceId: BookingSchedulingPort["resolveLegacyBranchServiceId"],
): Promise<RubitimeMappingSummary> {
  const db = getDrizzle();
  const pool = getPool();
  const { organizationId } = query;

  const [branches, services, locationRows, ssaRows, specialists, entityMaps] = await Promise.all([
    db
      .select()
      .from(beBranches)
      .where(and(eq(beBranches.organizationId, organizationId), eq(beBranches.isActive, true)))
      .orderBy(asc(beBranches.sortOrder), asc(beBranches.title)),
    db
      .select()
      .from(beClinicServices)
      .where(and(eq(beClinicServices.organizationId, organizationId), eq(beClinicServices.isActive, true)))
      .orderBy(asc(beClinicServices.sortOrder), asc(beClinicServices.title)),
    db
      .select()
      .from(beServiceLocationAvailability)
      .where(
        and(
          eq(beServiceLocationAvailability.organizationId, organizationId),
          eq(beServiceLocationAvailability.isActive, true),
        ),
      ),
    db
      .select()
      .from(beSpecialistServiceAvailability)
      .where(eq(beSpecialistServiceAvailability.organizationId, organizationId)),
    db
      .select()
      .from(beSpecialists)
      .where(and(eq(beSpecialists.organizationId, organizationId), eq(beSpecialists.isActive, true)))
      .orderBy(asc(beSpecialists.createdAt)),
    db
      .select()
      .from(beExternalEntityMappings)
      .where(
        and(
          eq(beExternalEntityMappings.organizationId, organizationId),
          eq(beExternalEntityMappings.externalSystem, "rubitime"),
        ),
      ),
  ]);

  const defaultSpecialist = specialists[0] ?? null;
  const locationPairKeys = new Set(locationRows.map((r) => `${r.branchId}:${r.serviceId}`));
  const ssaByPair = new Map<string, (typeof ssaRows)[0]>();
  for (const row of ssaRows) {
    if (!row.branchId) continue;
    ssaByPair.set(`${row.branchId}:${row.serviceId}`, row);
  }

  const canonicalBranchRubitime = new Map<string, string>();
  for (const m of entityMaps) {
    if (m.entityType === "branch") canonicalBranchRubitime.set(m.canonicalId, m.externalId);
  }
  const canonicalSpecialistRubitime = new Map<string, string>();
  for (const m of entityMaps) {
    if (m.entityType === "specialist") canonicalSpecialistRubitime.set(m.canonicalId, m.externalId);
  }
  const legacyIdBySsa = new Map<string, string>();
  for (const m of entityMaps) {
    if (m.entityType !== "availability") continue;
    const legacyId = (m.metadata as { legacy_branch_service_id?: string } | null)?.legacy_branch_service_id;
    if (legacyId) legacyIdBySsa.set(m.canonicalId, legacyId);
  }

  const legacyById = new Map<string, LegacyBranchServiceRow>();
  const legacyRes = await pool.query<LegacyBranchServiceRow>(
    `SELECT
       bbs.id,
       bbs.branch_id,
       bbs.service_id,
       bbs.specialist_id,
       bbs.rubitime_service_id,
       bbs.is_active,
       br.title AS branch_title,
       sp.full_name AS specialist_name,
       svc.title AS service_title,
       svc.duration_minutes AS service_duration,
       svc.price_minor AS service_price_minor
     FROM booking_branch_services bbs
     JOIN booking_branches br ON br.id = bbs.branch_id
     JOIN booking_specialists sp ON sp.id = bbs.specialist_id
     JOIN booking_services svc ON svc.id = bbs.service_id`,
  );
  for (const row of legacyRes.rows) legacyById.set(row.id, row);

  const rows: RubitimeMappingRow[] = [];

  for (const branch of branches) {
    if (query.branchId && branch.id !== query.branchId) continue;
    for (const service of services) {
      if (query.serviceId && service.id !== query.serviceId) continue;
      const pairKey = `${branch.id}:${service.id}`;
      const locationOk = locationPairKeys.has(pairKey);
      const ssa = ssaByPair.get(pairKey);
      const ssaOk = Boolean(ssa?.isActive);
      if (!locationOk && !ssaOk) continue;

      const specialistId = ssa?.specialistId ?? defaultSpecialist?.id ?? null;
      const branchServiceId = specialistId
        ? await resolveLegacyBranchServiceId({
            organizationId,
            branchId: branch.id,
            serviceId: service.id,
            specialistId,
          })
        : null;

      const legacyRow = branchServiceId ? (legacyById.get(branchServiceId) ?? null) : null;
      const ssaId = ssa?.id ?? null;
      const reverseMappingOk = Boolean(
        branchServiceId && ssaId && legacyIdBySsa.get(ssaId) === branchServiceId,
      );

      const branchEntityMapped = Boolean(canonicalBranchRubitime.get(branch.id));
      const specialistEntityMapped = specialistId
        ? Boolean(canonicalSpecialistRubitime.get(specialistId))
        : true;

      let serviceEntityMapped = true;
      if (legacyRow) {
        serviceEntityMapped = legacyRow.service_duration === service.durationMinutes;
      } else if (branchServiceId) {
        serviceEntityMapped = false;
      }

      const { status, issues } = computeRubitimeMappingStatus({
        branchServiceId,
        ssaPresent: Boolean(ssa),
        ssaActive: Boolean(ssa?.isActive),
        reverseMappingOk,
        branchEntityMapped,
        specialistEntityMapped,
        serviceEntityMapped,
        legacyActive: legacyRow?.is_active ?? (branchServiceId ? false : true),
        durationMismatch: legacyRow ? legacyRow.service_duration !== service.durationMinutes : false,
        priceMismatch: legacyRow ? legacyRow.service_price_minor !== service.priceMinor : false,
      });

      if (query.problemsOnly && status === "mapped_ok" && issues.length === 0) continue;

      rows.push({
        branchId: branch.id,
        branchTitle: branch.title,
        serviceId: service.id,
        serviceTitle: service.title,
        rubitimeBranchTitle: legacyRow?.branch_title ?? null,
        rubitimeSpecialistName: legacyRow?.specialist_name ?? null,
        rubitimeServiceTitle: legacyRow?.service_title ?? null,
        status,
        issues,
        branchServiceId,
      });
    }
  }

  let mappedOk = 0;
  let problems = 0;
  for (const row of rows) {
    if (row.status === "mapped_ok" && row.issues.length === 0) mappedOk += 1;
    else problems += 1;
  }

  return { total: rows.length, mappedOk, problems, rows };
}

async function linkMappingInternal(
  input: LinkRubitimeMappingInput,
  deps: {
    bookingCatalogPort: BookingCatalogPort;
    upsertSpecialistServiceAvailability: ServiceAvailabilityPort["upsertSpecialistServiceAvailability"];
  },
): Promise<LinkRubitimeMappingResult> {
  const db = getDrizzle();
  const branchRows = await db
    .select()
    .from(beBranches)
    .where(and(eq(beBranches.id, input.branchId), eq(beBranches.organizationId, input.organizationId)))
    .limit(1);
  const branch = branchRows[0];
  if (!branch) throw new Error("branch_not_found");

  const serviceRows = await db
    .select()
    .from(beClinicServices)
    .where(and(eq(beClinicServices.id, input.serviceId), eq(beClinicServices.organizationId, input.organizationId)))
    .limit(1);
  if (!serviceRows[0]) throw new Error("service_not_found");

  const branchService = await deps.bookingCatalogPort.upsertBranchServiceAdmin({
    branchId: input.legacyBranchId,
    serviceId: input.legacyServiceId,
    specialistId: input.legacySpecialistId,
    rubitimeServiceId: input.rubitimeServiceId.trim(),
    isActive: input.isActive ?? true,
    sortOrder: 0,
  });

  const ssa = await deps.upsertSpecialistServiceAvailability({
    organizationId: input.organizationId,
    specialistId: input.specialistId,
    serviceId: input.serviceId,
    branchId: input.branchId,
    roomId: null,
    cityCode: branch.cityCode,
    isActive: true,
    sortOrder: 0,
  });

  const now = new Date().toISOString();
  await db
    .insert(beExternalEntityMappings)
    .values({
      organizationId: input.organizationId,
      entityType: "availability",
      canonicalId: ssa.id,
      externalSystem: "rubitime",
      externalId: input.rubitimeServiceId.trim(),
      metadata: { legacy_branch_service_id: branchService.id },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        beExternalEntityMappings.externalSystem,
        beExternalEntityMappings.entityType,
        beExternalEntityMappings.externalId,
      ],
      set: {
        canonicalId: ssa.id,
        metadata: { legacy_branch_service_id: branchService.id },
        updatedAt: now,
      },
    });

  return { branchServiceId: branchService.id, ssaId: ssa.id };
}
