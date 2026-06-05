import { and, eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  buildLegacyAppointmentPayload,
  type ExternalMappingLookup,
} from "@/modules/booking-rubitime-bridge/legacyProjection";
import {
  recoverableAppointmentSlotPhoneQuery,
  recoverableAppointmentStrictQuery,
  type RecoverableAppointmentLookup,
} from "@/modules/booking-rubitime-bridge/recoverExistingProjection";
import type {
  RubitimeBridgePort,
  RubitimeCanonicalProjectionInput,
  RubitimeCanonicalProjectionResult,
} from "@/modules/booking-rubitime-bridge/ports";
import { isNativeBeIntegratorRecordId } from "@/modules/booking-rubitime-bridge/rubitimeIntegratorRecord";
import {
  readAttributionFromJson,
  shouldSkipInboundRubitimeEcho,
} from "@/modules/booking-appointment-sync/loopGuard";
import { withSyncAttributionStamp } from "@/modules/booking-appointment-sync/syncAttribution";
import type { SyncOrigin } from "@/modules/booking-appointment-sync/types";
import { buildCanonicalInboundSnapshot } from "@/modules/booking-appointment-sync/buildCanonicalSnapshot";
import { buildReverseMappingLookup } from "@/modules/booking-appointment-sync/reverseMapping";
import type { BridgeProjectionStats } from "@/modules/booking-engine/types";
import {
  beAppointmentEvents,
  beAppointmentHistoryEvents,
  beAppointments,
  beExternalEntityMappings,
} from "../../../db/schema/bookingEngine";
import { appointmentRecords, rubitimeRecords } from "../../../db/schema/schema";

async function readSettingBoolean(key: string, defaultValue: boolean): Promise<boolean> {
  const db = getDrizzle();
  const rows = await db.execute<{ value_json: unknown }>(
    sql`SELECT value_json FROM system_settings WHERE key = ${key} AND scope = 'admin' LIMIT 1`,
  );
  const row = rows.rows[0];
  if (!row?.value_json || typeof row.value_json !== "object") return defaultValue;
  const envelope = row.value_json as { value?: unknown };
  return typeof envelope.value === "boolean" ? envelope.value : defaultValue;
}

export async function loadExternalMappingLookup(organizationId: string): Promise<ExternalMappingLookup> {
  const db = getDrizzle();
  const rows = await db
    .select({
      entityType: beExternalEntityMappings.entityType,
      externalId: beExternalEntityMappings.externalId,
      canonicalId: beExternalEntityMappings.canonicalId,
    })
    .from(beExternalEntityMappings)
    .where(
      and(
        eq(beExternalEntityMappings.organizationId, organizationId),
        eq(beExternalEntityMappings.externalSystem, "rubitime"),
      ),
    );
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(`${r.entityType}:${r.externalId}`, r.canonicalId);
  }
  return {
    resolveCanonicalId(entityType, externalId) {
      return map.get(`${entityType}:${externalId}`) ?? null;
    },
  };
}

async function findRecoverableRubitimeProjectionId(
  db: ReturnType<typeof getDrizzle>,
  lookup: RecoverableAppointmentLookup,
): Promise<string | null> {
  const strict = await db.execute<{ id: string }>(recoverableAppointmentStrictQuery(lookup));
  if (strict.rows[0]?.id) return strict.rows[0].id;
  const fallback = await db.execute<{ id: string }>(recoverableAppointmentSlotPhoneQuery(lookup));
  return fallback.rows[0]?.id ?? null;
}

async function linkRecoveredRubitimeProjection(
  db: ReturnType<typeof getDrizzle>,
  params: {
    organizationId: string;
    appointmentId: string;
    externalId: string;
    eventPayload: Record<string, unknown>;
    now: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(beExternalEntityMappings)
      .values({
        organizationId: params.organizationId,
        entityType: "appointment",
        canonicalId: params.appointmentId,
        externalSystem: "rubitime",
        externalId: params.externalId,
        metadata: { projectedFrom: "read_bridge", recoveredExistingAppointment: true },
        createdAt: params.now,
        updatedAt: params.now,
      })
      .onConflictDoUpdate({
        target: [
          beExternalEntityMappings.externalSystem,
          beExternalEntityMappings.entityType,
          beExternalEntityMappings.externalId,
        ],
        set: {
          canonicalId: params.appointmentId,
          metadata: { projectedFrom: "read_bridge", recoveredExistingAppointment: true },
          updatedAt: params.now,
        },
      });
    await tx.insert(beAppointmentHistoryEvents).values({
      organizationId: params.organizationId,
      appointmentId: params.appointmentId,
      eventType: "rubitime_projection_mapping_recovered",
      payload: params.eventPayload,
      occurredAt: params.now,
    });
  });
}

export async function loadReverseMappingLookup(organizationId: string) {
  const db = getDrizzle();
  const rows = await db
    .select({
      entityType: beExternalEntityMappings.entityType,
      externalId: beExternalEntityMappings.externalId,
      canonicalId: beExternalEntityMappings.canonicalId,
    })
    .from(beExternalEntityMappings)
    .where(
      and(
        eq(beExternalEntityMappings.organizationId, organizationId),
        eq(beExternalEntityMappings.externalSystem, "rubitime"),
      ),
    );
  return buildReverseMappingLookup(rows);
}

export async function stampBeAppointmentMirrorAttribution(
  appointmentId: string,
  origin: SyncOrigin,
  syncedAt: string = new Date().toISOString(),
): Promise<void> {
  const db = getDrizzle();
  const rows = await db
    .select({ attributionJson: beAppointments.attributionJson })
    .from(beAppointments)
    .where(eq(beAppointments.id, appointmentId))
    .limit(1);
  const existing = rows[0];
  if (!existing) return;
  await db
    .update(beAppointments)
    .set({
      attributionJson: withSyncAttributionStamp(existing.attributionJson, origin, syncedAt),
      updatedAt: syncedAt,
    })
    .where(eq(beAppointments.id, appointmentId));
}

async function appendRubitimeProjectionHistory(
  tx: Pick<ReturnType<typeof getDrizzle>, "insert">,
  params: {
    organizationId: string;
    appointmentId: string;
    eventType: string;
    eventPayload: Record<string, unknown>;
    now: string;
  },
): Promise<void> {
  await tx.insert(beAppointmentEvents).values({
    organizationId: params.organizationId,
    appointmentId: params.appointmentId,
    eventType: params.eventType,
    payload: params.eventPayload,
  });
  await tx.insert(beAppointmentHistoryEvents).values({
    organizationId: params.organizationId,
    appointmentId: params.appointmentId,
    eventType: params.eventType,
    payload: params.eventPayload,
    occurredAt: params.now,
  });
}

async function updateMappedRubitimeProjection(
  db: ReturnType<typeof getDrizzle>,
  params: {
    organizationId: string;
    appointmentId: string;
    externalId: string;
    platformUserId: string | null;
    phoneNormalized: string | null;
    startAt: string;
    payloadJson: unknown;
    legacyStatus: string;
    lastEvent: string;
    lookup: ExternalMappingLookup;
  },
): Promise<"updated" | "skipped_echo_guard" | "stale_mapping_missing_canonical"> {
  const existingRows = await db
    .select({
      id: beAppointments.id,
      startAt: beAppointments.startAt,
      originalStartAt: beAppointments.originalStartAt,
      rescheduleCount: beAppointments.rescheduleCount,
      platformUserId: beAppointments.platformUserId,
      branchId: beAppointments.branchId,
      specialistId: beAppointments.specialistId,
      serviceId: beAppointments.serviceId,
      attributionJson: beAppointments.attributionJson,
    })
    .from(beAppointments)
    .where(eq(beAppointments.id, params.appointmentId))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) {
    console.warn("[appointment-mirror] stale mapping: canonical row missing on inbound update", {
      appointmentId: params.appointmentId,
      externalId: params.externalId,
    });
    return "stale_mapping_missing_canonical";
  }

  if (shouldSkipInboundRubitimeEcho(readAttributionFromJson(existing.attributionJson))) {
    console.info("[appointment-mirror] inbound skipped echo guard", {
      appointmentId: params.appointmentId,
      externalId: params.externalId,
    });
    return "skipped_echo_guard";
  }

  const payloadRecord =
    params.payloadJson && typeof params.payloadJson === "object" && !Array.isArray(params.payloadJson)
      ? (params.payloadJson as Record<string, unknown>)
      : {};
  const built = buildCanonicalInboundSnapshot({
    organizationId: params.organizationId,
    externalId: params.externalId,
    platformUserId: params.platformUserId,
    phoneNormalized: params.phoneNormalized,
    recordAt: params.startAt,
    legacyStatus: params.legacyStatus,
    lastEvent: params.lastEvent,
    payloadJson: payloadRecord,
    lookup: params.lookup,
    existingScope: {
      branchId: existing.branchId,
      specialistId: existing.specialistId,
      serviceId: existing.serviceId,
    },
  });
  const refs = built.mergedRefs;
  const status = built.snapshot.status;
  const legacy = buildLegacyAppointmentPayload(params.startAt, params.payloadJson);
  const now = new Date().toISOString();
  const timeChanged = existing.startAt !== params.startAt;
  const eventPayload = {
    externalId: params.externalId,
    legacyStatus: params.legacyStatus,
    lastEvent: params.lastEvent,
    ...refs,
  };

  await db.transaction(async (tx) => {
    await tx
      .update(beAppointments)
      .set({
        branchId: refs.branchId,
        specialistId: refs.specialistId,
        serviceId: refs.serviceId,
        platformUserId: params.platformUserId ?? existing.platformUserId,
        startAt: params.startAt,
        endAt: legacy.endAtIso,
        durationMinutes: legacy.durationMinutes,
        status,
        phoneNormalized: params.phoneNormalized,
        originalStartAt: existing.originalStartAt ?? existing.startAt,
        rescheduleCount: timeChanged ? existing.rescheduleCount + 1 : existing.rescheduleCount,
        attributionJson: withSyncAttributionStamp(existing.attributionJson, "rubitime", now),
        updatedAt: now,
      })
      .where(eq(beAppointments.id, params.appointmentId));
    await appendRubitimeProjectionHistory(tx, {
      organizationId: params.organizationId,
      appointmentId: params.appointmentId,
      eventType: "rubitime_projection_synced",
      eventPayload,
      now,
    });
  });
  return "updated";
}

async function insertRubitimeProjection(
  db: ReturnType<typeof getDrizzle>,
  lookup: ExternalMappingLookup,
  params: {
    organizationId: string;
    externalId: string;
    platformUserId: string | null;
    phoneNormalized: string | null;
    startAt: string;
    payloadJson: unknown;
    legacyStatus: string;
    lastEvent: string;
  },
): Promise<"inserted" | "recovered"> {
  const payloadRecord =
    params.payloadJson && typeof params.payloadJson === "object" && !Array.isArray(params.payloadJson)
      ? (params.payloadJson as Record<string, unknown>)
      : {};
  const built = buildCanonicalInboundSnapshot({
    organizationId: params.organizationId,
    externalId: params.externalId,
    platformUserId: params.platformUserId,
    phoneNormalized: params.phoneNormalized,
    recordAt: params.startAt,
    legacyStatus: params.legacyStatus,
    lastEvent: params.lastEvent,
    payloadJson: payloadRecord,
    lookup,
  });
  const refs = built.mergedRefs;
  const status = built.snapshot.status;
  const legacy = buildLegacyAppointmentPayload(params.startAt, params.payloadJson);
  const now = new Date().toISOString();
  const eventPayload = {
    externalId: params.externalId,
    legacyStatus: params.legacyStatus,
    lastEvent: params.lastEvent,
    ...refs,
  };

  const recoverableId = await findRecoverableRubitimeProjectionId(db, {
    organizationId: params.organizationId,
    specialistId: refs.specialistId,
    startAt: params.startAt,
    endAtIso: legacy.endAtIso,
    phoneNormalized: params.phoneNormalized,
  });
  if (recoverableId) {
    await linkRecoveredRubitimeProjection(db, {
      organizationId: params.organizationId,
      appointmentId: recoverableId,
      externalId: params.externalId,
      eventPayload,
      now,
    });
    return "recovered";
  }

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`rubitime_inbound:${params.externalId}`}))`,
    );
    const inserted = await tx
      .insert(beAppointments)
      .values({
        organizationId: params.organizationId,
        branchId: refs.branchId,
        specialistId: refs.specialistId,
        serviceId: refs.serviceId,
        platformUserId: params.platformUserId,
        startAt: params.startAt,
        endAt: legacy.endAtIso,
        durationMinutes: legacy.durationMinutes,
        source: "rubitime_projection",
        status,
        originalStartAt: params.startAt,
        rescheduleCount: 0,
        phoneNormalized: params.phoneNormalized,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: beAppointments.id });
    const appointmentId = inserted[0]!.id;
    await tx.insert(beExternalEntityMappings).values({
      organizationId: params.organizationId,
      entityType: "appointment",
      canonicalId: appointmentId,
      externalSystem: "rubitime",
      externalId: params.externalId,
      metadata: { projectedFrom: "rubitime_live_projection" },
      createdAt: now,
      updatedAt: now,
    });
    await appendRubitimeProjectionHistory(tx, {
      organizationId: params.organizationId,
      appointmentId,
      eventType: "projected_from_rubitime",
      eventPayload,
      now,
    });
  });
  return "inserted";
}

async function upsertCanonicalFromRubitimeRecordImpl(
  input: RubitimeCanonicalProjectionInput,
): Promise<RubitimeCanonicalProjectionResult> {
  const externalId = input.externalId.trim();
  if (!externalId || isNativeBeIntegratorRecordId(externalId)) {
    return { action: "skipped_native_integrator_id" };
  }

  const db = getDrizzle();
  const lookup = await loadExternalMappingLookup(input.organizationId);
  const mapped = await db
    .select({ canonicalId: beExternalEntityMappings.canonicalId })
    .from(beExternalEntityMappings)
    .where(
      and(
        eq(beExternalEntityMappings.externalSystem, "rubitime"),
        eq(beExternalEntityMappings.entityType, "appointment"),
        eq(beExternalEntityMappings.externalId, externalId),
      ),
    )
    .limit(1);

  if (mapped[0]) {
    if (!input.recordAt) {
      return { action: "skipped_no_record_at", appointmentId: mapped[0].canonicalId };
    }
    const updateResult = await updateMappedRubitimeProjection(db, {
      organizationId: input.organizationId,
      appointmentId: mapped[0].canonicalId,
      externalId,
      platformUserId: input.platformUserId,
      phoneNormalized: input.phoneNormalized,
      startAt: input.recordAt,
      payloadJson: input.payloadJson,
      legacyStatus: input.legacyStatus,
      lastEvent: input.lastEvent,
      lookup,
    });
    if (updateResult === "skipped_echo_guard") {
      return { action: "skipped_echo_guard", appointmentId: mapped[0].canonicalId };
    }
    if (updateResult === "stale_mapping_missing_canonical") {
      return { action: "stale_mapping_missing_canonical", appointmentId: mapped[0].canonicalId };
    }
    return { action: "updated", appointmentId: mapped[0].canonicalId };
  }

  if (!input.recordAt) {
    return { action: "skipped_no_record_at" };
  }

  const insertResult = await insertRubitimeProjection(db, lookup, {
    organizationId: input.organizationId,
    externalId,
    platformUserId: input.platformUserId,
    phoneNormalized: input.phoneNormalized,
    startAt: input.recordAt,
    payloadJson: input.payloadJson,
    legacyStatus: input.legacyStatus,
    lastEvent: input.lastEvent,
  });
  if (insertResult === "recovered") {
    const recovered = await db
      .select({ canonicalId: beExternalEntityMappings.canonicalId })
      .from(beExternalEntityMappings)
      .where(
        and(
          eq(beExternalEntityMappings.externalSystem, "rubitime"),
          eq(beExternalEntityMappings.entityType, "appointment"),
          eq(beExternalEntityMappings.externalId, externalId),
        ),
      )
      .limit(1);
    const appointmentId = recovered[0]?.canonicalId;
    if (appointmentId && input.recordAt) {
      const updateResult = await updateMappedRubitimeProjection(db, {
        organizationId: input.organizationId,
        appointmentId,
        externalId,
        platformUserId: input.platformUserId,
        phoneNormalized: input.phoneNormalized,
        startAt: input.recordAt,
        payloadJson: input.payloadJson,
        legacyStatus: input.legacyStatus,
        lastEvent: input.lastEvent,
        lookup,
      });
      if (updateResult === "updated") {
        return { action: "updated", appointmentId };
      }
      if (updateResult === "skipped_echo_guard") {
        return { action: "skipped_echo_guard", appointmentId };
      }
      if (updateResult === "stale_mapping_missing_canonical") {
        return { action: "stale_mapping_missing_canonical", appointmentId };
      }
    }
    return { action: "recovered", appointmentId };
  }

  const created = await db
    .select({ canonicalId: beExternalEntityMappings.canonicalId })
    .from(beExternalEntityMappings)
    .where(
      and(
        eq(beExternalEntityMappings.externalSystem, "rubitime"),
        eq(beExternalEntityMappings.entityType, "appointment"),
        eq(beExternalEntityMappings.externalId, externalId),
      ),
    )
    .limit(1);
  return { action: "inserted", appointmentId: created[0]?.canonicalId };
}

async function projectRows(
  organizationId: string,
  rows: {
    externalId: string;
    platformUserId: string | null;
    phoneNormalized: string | null;
    recordAt: string;
    status: string;
    lastEvent: string;
    payloadJson: unknown;
  }[],
): Promise<BridgeProjectionStats> {
  let projectedAppointments = 0;
  let updatedAppointments = 0;
  let skippedExisting = 0;
  let recoveredMappings = 0;
  for (const row of rows) {
    const result = await upsertCanonicalFromRubitimeRecordImpl({
      organizationId,
      externalId: row.externalId,
      platformUserId: row.platformUserId,
      phoneNormalized: row.phoneNormalized,
      recordAt: row.recordAt,
      payloadJson: row.payloadJson,
      legacyStatus: row.status,
      lastEvent: row.lastEvent,
    });
    if (result.action === "inserted") projectedAppointments += 1;
    else if (result.action === "updated") updatedAppointments += 1;
    else if (result.action === "recovered") {
      recoveredMappings += 1;
    } else if (
      result.action === "skipped_native_integrator_id"
      || result.action === "skipped_echo_guard"
      || result.action === "skipped_no_record_at"
    ) {
      skippedExisting += 1;
    }
  }
  return { projectedAppointments, updatedAppointments, skippedExisting, recoveredMappings };
}

export function createPgBookingRubitimeBridgePort(): RubitimeBridgePort {
  return {
    async isBridgeEnabled() {
      return readSettingBoolean("booking_rubitime_bridge_enabled", false);
    },

    async upsertCanonicalFromRubitimeRecord(input) {
      return upsertCanonicalFromRubitimeRecordImpl(input);
    },

    async projectAppointmentRecords(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(appointmentRecords)
        .where(sql`${appointmentRecords.deletedAt} IS NULL AND ${appointmentRecords.recordAt} IS NOT NULL`);
      return projectRows(
        organizationId,
        rows.map((row) => ({
          externalId: row.integratorRecordId,
          platformUserId: row.platformUserId ?? null,
          phoneNormalized: row.phoneNormalized ?? null,
          recordAt: row.recordAt!,
          status: row.status,
          lastEvent: row.lastEvent,
          payloadJson: row.payloadJson,
        })),
      );
    },

    async projectRubitimeRecords(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(rubitimeRecords)
        .where(sql`${rubitimeRecords.recordAt} IS NOT NULL`);
      return projectRows(
        organizationId,
        rows.map((row) => ({
          externalId: row.rubitimeRecordId,
          platformUserId: null,
          phoneNormalized: row.phoneNormalized ?? null,
          recordAt: row.recordAt!,
          status: row.status,
          lastEvent: row.lastEvent,
          payloadJson: row.payloadJson,
        })),
      );
    },

    async getMappingSummary(organizationId) {
      const db = getDrizzle();
      const rows = await db.execute<{
        branches: string;
        specialists: string;
        services: string;
        availabilities: string;
        appointments: string;
      }>(sql`
        SELECT
          COUNT(*) FILTER (WHERE entity_type = 'branch')::text AS branches,
          COUNT(*) FILTER (WHERE entity_type = 'specialist')::text AS specialists,
          COUNT(*) FILTER (WHERE entity_type = 'service')::text AS services,
          COUNT(*) FILTER (WHERE entity_type = 'availability')::text AS availabilities,
          COUNT(*) FILTER (WHERE entity_type = 'appointment')::text AS appointments
        FROM be_external_entity_mappings
        WHERE organization_id = ${organizationId}::uuid
      `);
      const r = rows.rows[0];
      return {
        branches: Number(r?.branches ?? 0),
        specialists: Number(r?.specialists ?? 0),
        services: Number(r?.services ?? 0),
        availabilities: Number(r?.availabilities ?? 0),
        appointments: Number(r?.appointments ?? 0),
      };
    },
  };
}
