import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import type { BookingCatalogPort } from "@/modules/booking-catalog/ports";
import type { ServiceAvailabilityPort } from "@/modules/booking-engine/ports";
import type { BookingSchedulingPort } from "@/modules/booking-scheduling/ports";
import {
  legacyBranchServiceIdBySsaFromMappings,
  pickPreferredSsaId,
} from "@/modules/booking-scheduling/ssaResolve";
import { computeRubitimeMappingStatus } from "@/modules/rubitime-mapping/computeStatus";
import type { ListRubitimeMappingQuery, RubitimeMappingPort } from "@/modules/rubitime-mapping/ports";
import type {
  LinkRubitimeMappingInput,
  LinkRubitimeMappingResult,
  ResolveRubitimeSsaDuplicateInput,
  ResolveRubitimeSsaDuplicateResult,
  RubitimeMappingIssueDetails,
  RubitimeSsaDuplicateGroup,
  RubitimeSsaDuplicateSummary,
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
    listSsaDuplicates(input) {
      return listSsaDuplicatesInternal(input.organizationId);
    },
    resolveSsaDuplicate(input) {
      return resolveSsaDuplicateInternal(input);
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
  const legacyIdBySsa = legacyBranchServiceIdBySsaFromMappings(
    entityMaps
      .filter((m) => m.entityType === "availability")
      .map((m) => ({ canonicalId: m.canonicalId, metadata: m.metadata })),
  );
  const ssaGrouped = new Map<string, (typeof ssaRows)[number][]>();
  for (const row of ssaRows) {
    if (!row.branchId) continue;
    const pairKey = `${row.branchId}:${row.serviceId}`;
    const list = ssaGrouped.get(pairKey) ?? [];
    list.push(row);
    ssaGrouped.set(pairKey, list);
  }
  const ssaByPair = new Map<string, (typeof ssaRows)[0]>();
  for (const [pairKey, list] of ssaGrouped) {
    const pickedId = pickPreferredSsaId(
      list.map((r) => ({ id: r.id, createdAt: r.createdAt, isActive: r.isActive })),
      legacyIdBySsa,
    );
    const picked = list.find((r) => r.id === pickedId);
    if (picked) ssaByPair.set(pairKey, picked);
  }

  const canonicalBranchRubitime = new Map<string, string>();
  for (const m of entityMaps) {
    if (m.entityType === "branch") canonicalBranchRubitime.set(m.canonicalId, m.externalId);
  }
  const canonicalSpecialistRubitime = new Map<string, string>();
  for (const m of entityMaps) {
    if (m.entityType === "specialist") canonicalSpecialistRubitime.set(m.canonicalId, m.externalId);
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

      const durationMismatch = legacyRow ? legacyRow.service_duration !== service.durationMinutes : false;
      const priceMismatch = legacyRow ? legacyRow.service_price_minor !== service.priceMinor : false;

      const { status, issues } = computeRubitimeMappingStatus({
        branchServiceId,
        ssaPresent: Boolean(ssa),
        ssaActive: Boolean(ssa?.isActive),
        reverseMappingOk,
        branchEntityMapped,
        specialistEntityMapped,
        serviceEntityMapped,
        legacyActive: legacyRow?.is_active ?? (branchServiceId ? false : true),
        durationMismatch,
        priceMismatch,
      });

      if (query.problemsOnly && status === "mapped_ok" && issues.length === 0) continue;

      const issueDetails: RubitimeMappingIssueDetails = {};
      if (durationMismatch && legacyRow) {
        issueDetails.durationMismatch = {
          canonicalMinutes: service.durationMinutes,
          legacyMinutes: legacyRow.service_duration,
        };
      }
      if (priceMismatch && legacyRow) {
        issueDetails.priceMismatch = {
          canonicalPriceMinor: service.priceMinor,
          legacyPriceMinor: legacyRow.service_price_minor,
        };
      }

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
        issueDetails:
          issueDetails.durationMismatch || issueDetails.priceMismatch ? issueDetails : undefined,
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

async function listSsaDuplicatesInternal(organizationId: string): Promise<RubitimeSsaDuplicateSummary> {
  const db = getDrizzle();
  const [ssaRows, branches, services, specialists] = await Promise.all([
    db
      .select()
      .from(beSpecialistServiceAvailability)
      .where(and(eq(beSpecialistServiceAvailability.organizationId, organizationId), isNull(beSpecialistServiceAvailability.roomId))),
    db.select().from(beBranches).where(eq(beBranches.organizationId, organizationId)),
    db.select().from(beClinicServices).where(eq(beClinicServices.organizationId, organizationId)),
    db.select().from(beSpecialists).where(eq(beSpecialists.organizationId, organizationId)),
  ]);

  const scopeRows = ssaRows.filter((row) => Boolean(row.branchId));
  if (scopeRows.length === 0) return { totalGroups: 0, groups: [] };

  const mapRows = await db
    .select({
      canonicalId: beExternalEntityMappings.canonicalId,
      externalId: beExternalEntityMappings.externalId,
      metadata: beExternalEntityMappings.metadata,
    })
    .from(beExternalEntityMappings)
    .where(
      and(
        eq(beExternalEntityMappings.organizationId, organizationId),
        eq(beExternalEntityMappings.entityType, "availability"),
        eq(beExternalEntityMappings.externalSystem, "rubitime"),
        inArray(
          beExternalEntityMappings.canonicalId,
          scopeRows.map((row) => row.id),
        ),
      ),
    );

  const rubitimeIdBySsaId = new Map<string, string>();
  for (const row of mapRows) {
    rubitimeIdBySsaId.set(row.canonicalId, row.externalId);
  }
  const legacyBySsaId = legacyBranchServiceIdBySsaFromMappings(mapRows);

  const branchById = new Map(branches.map((row) => [row.id, row]));
  const serviceById = new Map(services.map((row) => [row.id, row]));
  const specialistById = new Map(specialists.map((row) => [row.id, row]));

  const grouped = new Map<string, (typeof scopeRows)[number][]>();
  for (const row of scopeRows) {
    if (!row.branchId) continue;
    const key = `${row.branchId}:${row.serviceId}:${row.specialistId}`;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }

  const groups: RubitimeSsaDuplicateGroup[] = [];
  for (const [key, groupRows] of grouped) {
    // Actionable duplicates are rows that still affect runtime:
    // active rows or rows that still keep an external mapping link.
    const actionableRows = groupRows.filter(
      (row) => row.isActive || rubitimeIdBySsaId.has(row.id) || legacyBySsaId.has(row.id),
    );
    if (actionableRows.length < 2) continue;
    const [branchId, serviceId, specialistId] = key.split(":");
    const branch = branchById.get(branchId);
    const service = serviceById.get(serviceId);
    const specialist = specialistById.get(specialistId);
    if (!branch || !service) continue;

    const recommendedKeepSsaId = pickPreferredSsaId(
      actionableRows.map((row) => ({ id: row.id, createdAt: row.createdAt, isActive: row.isActive })),
      legacyBySsaId,
    );
    if (!recommendedKeepSsaId) continue;

    groups.push({
      branchId,
      branchTitle: branch.title,
      serviceId,
      serviceTitle: service.title,
      specialistId,
      specialistName: specialist?.fullName ?? null,
      recommendedKeepSsaId,
      rows: [...actionableRows]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((row) => ({
          ssaId: row.id,
          specialistId: row.specialistId,
          specialistName: specialistById.get(row.specialistId)?.fullName ?? null,
          isActive: row.isActive,
          createdAt: row.createdAt,
          cityCode: row.cityCode ?? null,
          hasMapping: rubitimeIdBySsaId.has(row.id),
          rubitimeServiceId: rubitimeIdBySsaId.get(row.id) ?? null,
          legacyBranchServiceId: legacyBySsaId.get(row.id) ?? null,
        })),
    });
  }

  groups.sort((a, b) => {
    const byBranch = a.branchTitle.localeCompare(b.branchTitle, "ru");
    if (byBranch !== 0) return byBranch;
    const byService = a.serviceTitle.localeCompare(b.serviceTitle, "ru");
    if (byService !== 0) return byService;
    return (a.specialistName ?? "").localeCompare(b.specialistName ?? "", "ru");
  });

  return { totalGroups: groups.length, groups };
}

async function resolveSsaDuplicateInternal(
  input: ResolveRubitimeSsaDuplicateInput,
): Promise<ResolveRubitimeSsaDuplicateResult> {
  const db = getDrizzle();
  const rows = await db
    .select()
    .from(beSpecialistServiceAvailability)
    .where(
      and(
        eq(beSpecialistServiceAvailability.organizationId, input.organizationId),
        eq(beSpecialistServiceAvailability.branchId, input.branchId),
        eq(beSpecialistServiceAvailability.serviceId, input.serviceId),
        eq(beSpecialistServiceAvailability.specialistId, input.specialistId),
        isNull(beSpecialistServiceAvailability.roomId),
      ),
    );

  if (rows.length === 0) throw new Error("ssa_not_found");
  const keep = rows.find((row) => row.id === input.keepSsaId);
  if (!keep) throw new Error("keep_ssa_not_found");

  const now = new Date().toISOString();
  const siblingIds = rows.map((row) => row.id);
  const mapRows = await db
    .select({
      canonicalId: beExternalEntityMappings.canonicalId,
      externalId: beExternalEntityMappings.externalId,
      metadata: beExternalEntityMappings.metadata,
      updatedAt: beExternalEntityMappings.updatedAt,
    })
    .from(beExternalEntityMappings)
    .where(
      and(
        eq(beExternalEntityMappings.organizationId, input.organizationId),
        eq(beExternalEntityMappings.entityType, "availability"),
        eq(beExternalEntityMappings.externalSystem, "rubitime"),
        inArray(beExternalEntityMappings.canonicalId, siblingIds),
      ),
    );

  let transferredMapping = false;
  const keepHasMapping = mapRows.some((row) => row.canonicalId === input.keepSsaId);
  if ((input.transferMappingToKeep ?? true) && !keepHasMapping) {
    const source = [...mapRows]
      .filter((row) => row.canonicalId !== input.keepSsaId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (source) {
      await db
        .insert(beExternalEntityMappings)
        .values({
          organizationId: input.organizationId,
          entityType: "availability",
          canonicalId: input.keepSsaId,
          externalSystem: "rubitime",
          externalId: source.externalId,
          metadata: source.metadata,
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
            canonicalId: input.keepSsaId,
            metadata: source.metadata,
            updatedAt: now,
          },
        });
      transferredMapping = true;
    }
  }

  if (!keep.isActive) {
    await db
      .update(beSpecialistServiceAvailability)
      .set({ isActive: true, updatedAt: now })
      .where(eq(beSpecialistServiceAvailability.id, input.keepSsaId));
  }

  const deactivatedIds = rows.filter((row) => row.id !== input.keepSsaId && row.isActive).map((row) => row.id);
  if (deactivatedIds.length > 0) {
    await db
      .update(beSpecialistServiceAvailability)
      .set({ isActive: false, updatedAt: now })
      .where(inArray(beSpecialistServiceAvailability.id, deactivatedIds));
  }

  const dropMappingIds = rows.filter((row) => row.id !== input.keepSsaId).map((row) => row.id);
  if (dropMappingIds.length > 0) {
    await db
      .delete(beExternalEntityMappings)
      .where(
        and(
          eq(beExternalEntityMappings.organizationId, input.organizationId),
          eq(beExternalEntityMappings.entityType, "availability"),
          eq(beExternalEntityMappings.externalSystem, "rubitime"),
          inArray(beExternalEntityMappings.canonicalId, dropMappingIds),
        ),
      );
  }

  return {
    branchId: input.branchId,
    serviceId: input.serviceId,
    specialistId: input.specialistId,
    keepSsaId: input.keepSsaId,
    deactivatedIds,
    transferredMapping,
  };
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

  const [legacyBranch, legacySpecialist] = await Promise.all([
    deps.bookingCatalogPort.getBranchById(input.legacyBranchId),
    deps.bookingCatalogPort.getSpecialistById(input.legacySpecialistId),
  ]);
  if (!legacyBranch) throw new Error("branch_not_found");
  if (!legacySpecialist) throw new Error("specialist_not_found");
  if (legacySpecialist.branchId !== legacyBranch.id) throw new Error("specialist_branch_mismatch");

  const branchService = await deps.bookingCatalogPort.upsertBranchServiceAdmin({
    branchId: legacyBranch.id,
    serviceId: input.legacyServiceId,
    specialistId: legacySpecialist.id,
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
  await Promise.all([
    db
      .insert(beExternalEntityMappings)
      .values({
        organizationId: input.organizationId,
        entityType: "branch",
        canonicalId: input.branchId,
        externalSystem: "rubitime",
        externalId: legacyBranch.rubitimeBranchId,
        metadata: {},
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
          canonicalId: input.branchId,
          metadata: {},
          updatedAt: now,
        },
      }),
    db
      .insert(beExternalEntityMappings)
      .values({
        organizationId: input.organizationId,
        entityType: "specialist",
        canonicalId: input.specialistId,
        externalSystem: "rubitime",
        externalId: legacySpecialist.rubitimeCooperatorId,
        metadata: {},
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
          canonicalId: input.specialistId,
          metadata: {},
          updatedAt: now,
        },
      }),
    db
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
      }),
  ]);

  return { branchServiceId: branchService.id, ssaId: ssa.id };
}
