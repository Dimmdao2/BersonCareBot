import { and, eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  buildLegacyAppointmentPayload,
  mapLegacyStatusToCanonical,
  resolveAppointmentCanonicalRefs,
  type ExternalMappingLookup,
} from "@/modules/booking-rubitime-bridge/legacyProjection";
import type { RubitimeBridgePort } from "@/modules/booking-rubitime-bridge/ports";
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

async function loadMappingLookup(organizationId: string): Promise<ExternalMappingLookup> {
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

async function upsertProjectedAppointment(
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
): Promise<"projected" | "skipped"> {
  const db = getDrizzle();
  const existing = await db
    .select({ canonicalId: beExternalEntityMappings.canonicalId })
    .from(beExternalEntityMappings)
    .where(
      and(
        eq(beExternalEntityMappings.externalSystem, "rubitime"),
        eq(beExternalEntityMappings.entityType, "appointment"),
        eq(beExternalEntityMappings.externalId, params.externalId),
      ),
    )
    .limit(1);
  if (existing[0]) return "skipped";

  const legacy = buildLegacyAppointmentPayload(params.startAt, params.payloadJson);
  const refs = resolveAppointmentCanonicalRefs(lookup, legacy);
  const status = mapLegacyStatusToCanonical(params.legacyStatus, params.lastEvent);
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
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
    const eventPayload = {
      externalId: params.externalId,
      legacyStatus: params.legacyStatus,
      ...refs,
    };
    await tx.insert(beExternalEntityMappings).values({
      organizationId: params.organizationId,
      entityType: "appointment",
      canonicalId: appointmentId,
      externalSystem: "rubitime",
      externalId: params.externalId,
      metadata: { projectedFrom: "read_bridge" },
    });
    await tx.insert(beAppointmentEvents).values({
      organizationId: params.organizationId,
      appointmentId,
      eventType: "projected_from_rubitime",
      payload: eventPayload,
    });
    await tx.insert(beAppointmentHistoryEvents).values({
      organizationId: params.organizationId,
      appointmentId,
      eventType: "projected_from_rubitime",
      payload: eventPayload,
      occurredAt: now,
    });
    return "projected" as const;
  });
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
  const lookup = await loadMappingLookup(organizationId);
  let projectedAppointments = 0;
  let skippedExisting = 0;
  for (const row of rows) {
    const result = await upsertProjectedAppointment(lookup, {
      organizationId,
      externalId: row.externalId,
      platformUserId: row.platformUserId,
      phoneNormalized: row.phoneNormalized,
      startAt: row.recordAt,
      payloadJson: row.payloadJson,
      legacyStatus: row.status,
      lastEvent: row.lastEvent,
    });
    if (result === "projected") projectedAppointments += 1;
    else skippedExisting += 1;
  }
  return { projectedAppointments, skippedExisting };
}

export function createPgBookingRubitimeBridgePort(): RubitimeBridgePort {
  return {
    async isBridgeEnabled() {
      return readSettingBoolean("booking_rubitime_bridge_enabled", false);
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
