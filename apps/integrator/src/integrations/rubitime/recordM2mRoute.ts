/**
 * M2M от webapp: обновление / отмена записи Rubitime (api2/update-record, remove-record).
 * Подпись как у send-sms / send-email.
 */
import type { FastifyInstance } from 'fastify';
import { logger } from '../../infra/observability/logger.js';
import { createDbPort } from '../../infra/db/client.js';
import {
  createRubitimeRecord,
  fetchRubitimeSchedule,
  removeRubitimeRecord,
  updateRubitimeRecord,
} from './client.js';
import { resolveScheduleParams } from './bookingScheduleMapping.js';
import { isLegacyBookingProfileResolveEnabled } from './legacyResolveFlag.js';
import { normalizeRubitimeSchedule } from './scheduleNormalizer.js';
import {
  formatIsoInstantAsRubitimeRecordLocal,
  getAppDisplayTimezone,
} from '../../config/appTimezone.js';
import {
  isRubitimeUpdateRecordPatchEmpty,
  normalizeRubitimeUpdateRecordPatch,
} from './normalizeUpdateRecordPatch.js';
import { createGetBranchTimezoneWithDataQuality } from '../../infra/db/branchTimezone.js';
import type { z } from 'zod';
import {
  RubitimeCreateRecordV1Schema,
  RubitimeSlotsQueryV1Schema,
  parseRubitimeSlotsQuery,
  parseRubitimeCreateRecordInput,
} from './schema.js';
import {
  createSignedRequestGuard,
  handleBookingEventRequest,
  type BookingLifecycleRouteDeps,
} from '../bersoncare/bookingLifecycleRoute.js';

type RubitimeCreateRecordV1 = z.infer<typeof RubitimeCreateRecordV1Schema>;
type RubitimeSlotsQueryV1 = z.infer<typeof RubitimeSlotsQueryV1Schema>;
import { ERR_LEGACY_RESOLVE_DISABLED } from './internalContract.js';
import { runPostCreateProjection } from './postCreateProjection.js';

/** Rubitime API2 `create-record` requires `status` (numeric status id; 0 matches get-record/update-record tests). */
const RUBITIME_CREATE_RECORD_DEFAULT_STATUS = 0;

function parseJsonRecordId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const id = (body as Record<string, unknown>).recordId;
  if (typeof id === 'number' && Number.isFinite(id)) return String(Math.trunc(id));
  if (typeof id === 'string' && id.trim().length > 0) return id.trim();
  return null;
}

export type RubitimeRecordM2mDeps = BookingLifecycleRouteDeps;

/** Rubitime API2 expects integer IDs; webapp sends string/number from catalog. */
function parseRubitimeNumericId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export async function registerRubitimeRecordM2mRoutes(
  app: FastifyInstance,
  deps: RubitimeRecordM2mDeps,
): Promise<void> {
  const { sharedSecret, dispatchPort } = deps;
  const dbPort = createDbPort();
  const getBranchTzWithIncident = createGetBranchTimezoneWithDataQuality({
    db: dbPort,
    dispatchPort,
  });

  const guard = createSignedRequestGuard(sharedSecret, 'rubitime m2m');

  app.post('/api/bersoncare/rubitime/update-record', async (request, reply) => {
    const g = guard(request);
    if (!g.ok) {
      return reply.code(g.code).send({ ok: false, error: g.err });
    }
    const recordId = parseJsonRecordId(request.body);
    if (!recordId) {
      return reply.code(400).send({ ok: false, error: 'recordId required' });
    }
    const patch =
      typeof request.body === 'object' && request.body !== null && 'patch' in request.body
        ? (request.body as { patch?: unknown }).patch
        : null;
    const rawPatch =
      typeof patch === 'object' && patch !== null && !Array.isArray(patch)
        ? (patch as Record<string, unknown>)
        : {};
    let timeZone = await getAppDisplayTimezone({ db: dbPort, dispatchPort });
    const branchRaw = rawPatch.branch_id ?? rawPatch.branchId;
    const branchNum =
      typeof branchRaw === 'number' && Number.isFinite(branchRaw)
        ? Math.trunc(branchRaw)
        : typeof branchRaw === 'string' && branchRaw.trim()
          ? Number(branchRaw.trim())
          : NaN;
    if (Number.isFinite(branchNum)) {
      timeZone = await getBranchTzWithIncident(String(branchNum));
    }
    const data = normalizeRubitimeUpdateRecordPatch(rawPatch, timeZone);
    if (isRubitimeUpdateRecordPatchEmpty(data)) {
      return reply.code(400).send({ ok: false, error: 'empty_patch' });
    }
    try {
      const result = await updateRubitimeRecord({ recordId, data });
      return reply.code(200).send({ ok: true, data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err, recordId }, 'rubitime update-record failed');
      return reply.code(502).send({ ok: false, error: msg });
    }
  });

  app.post('/api/bersoncare/rubitime/remove-record', async (request, reply) => {
    const g = guard(request);
    if (!g.ok) {
      return reply.code(g.code).send({ ok: false, error: g.err });
    }
    const recordId = parseJsonRecordId(request.body);
    if (!recordId) {
      return reply.code(400).send({ ok: false, error: 'recordId required' });
    }
    try {
      const result = await removeRubitimeRecord({ recordId });
      return reply.code(200).send({ ok: true, data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err, recordId }, 'rubitime remove-record failed');
      return reply.code(502).send({ ok: false, error: msg });
    }
  });

  app.post('/api/bersoncare/rubitime/create-record', async (request, reply) => {
    const g = guard(request);
    if (!g.ok) {
      return reply.code(g.code).send({ ok: false, error: g.err });
    }
    const parsed = parseRubitimeCreateRecordInput(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_create_record_input' });
    }
    const input = parsed.data;

    if ('version' in input && input.version === 'v2') {
      const branchId = parseRubitimeNumericId(input.rubitimeBranchId);
      const cooperatorId = parseRubitimeNumericId(input.rubitimeCooperatorId);
      const serviceId = parseRubitimeNumericId(input.rubitimeServiceId);
      if (branchId === null || cooperatorId === null || serviceId === null) {
        return reply.code(400).send({ ok: false, error: 'invalid_rubitime_ids' });
      }
      const branchTimezone = await getBranchTzWithIncident(String(branchId));
      const rubitimeDatetime = formatIsoInstantAsRubitimeRecordLocal(
        input.slotStart,
        branchTimezone,
      );
      const rubitimePayload: Record<string, unknown> = {
        branch_id: branchId,
        cooperator_id: cooperatorId,
        service_id: serviceId,
        record: rubitimeDatetime,
        status: RUBITIME_CREATE_RECORD_DEFAULT_STATUS,
        name: input.patient.name,
        phone: input.patient.phone,
      };
      const email = input.patient.email?.trim();
      if (email) {
        rubitimePayload.email = email;
      }
      try {
        const result = await createRubitimeRecord({ data: rubitimePayload });
        const recordId =
          typeof result.id === 'string' || typeof result.id === 'number' ? String(result.id) : null;

        let projectionWarning: string | undefined;
        if (recordId) {
          const proj = await runPostCreateProjection(recordId, {
            dispatchPort: deps.dispatchPort,
            dbWritePort: deps.dbWritePort,
            webappEventsPort: deps.webappEventsPort,
          });
          if (!proj.projectionOk) {
            projectionWarning = proj.error;
          }
          logger.info(
            { recordId, projectionOk: proj.projectionOk, gcalEventId: proj.gcalEventId },
            'create-record completed with projection',
          );
        }

        return reply
          .code(200)
          .send({
            ok: true,
            recordId,
            data: result,
            ...(projectionWarning ? { projectionWarning } : {}),
          });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ err }, 'rubitime create-record failed (v2)');
        return reply.code(502).send({ ok: false, error: msg });
      }
    } else {
      const v1 = input as RubitimeCreateRecordV1;
      if (!isLegacyBookingProfileResolveEnabled()) {
        return reply.code(400).send({ ok: false, error: ERR_LEGACY_RESOLVE_DISABLED });
      }

      const scheduleParams = await resolveScheduleParams({
        type: v1.type,
        category: v1.category,
        ...(v1.city ? { city: v1.city } : {}),
      });
      if (!scheduleParams) {
        logger.warn(
          { type: v1.type, category: v1.category, city: v1.city },
          'rubitime create-record: no booking profile for query',
        );
        return reply.code(400).send({ ok: false, error: 'slots_mapping_not_configured' });
      }

      const branchTimezone = await getBranchTzWithIncident(String(scheduleParams.branchId));
      const rubitimeDatetime = formatIsoInstantAsRubitimeRecordLocal(v1.slotStart, branchTimezone);

      const rubitimePayload: Record<string, unknown> = {
        branch_id: scheduleParams.branchId,
        cooperator_id: scheduleParams.cooperatorId,
        service_id: scheduleParams.serviceId,
        record: rubitimeDatetime,
        status: RUBITIME_CREATE_RECORD_DEFAULT_STATUS,
        name: v1.contactName,
        phone: v1.contactPhone,
      };
      if (v1.contactEmail && v1.contactEmail.trim()) {
        rubitimePayload.email = v1.contactEmail.trim();
      }

      try {
        const result = await createRubitimeRecord({ data: rubitimePayload });
        const recordId =
          typeof result.id === 'string' || typeof result.id === 'number' ? String(result.id) : null;

        let projectionWarning: string | undefined;
        if (recordId) {
          const proj = await runPostCreateProjection(recordId, {
            dispatchPort: deps.dispatchPort,
            dbWritePort: deps.dbWritePort,
            webappEventsPort: deps.webappEventsPort,
          });
          if (!proj.projectionOk) {
            projectionWarning = proj.error;
          }
          logger.info(
            { recordId, projectionOk: proj.projectionOk, gcalEventId: proj.gcalEventId },
            'create-record completed with projection',
          );
        }

        return reply
          .code(200)
          .send({
            ok: true,
            recordId,
            data: result,
            ...(projectionWarning ? { projectionWarning } : {}),
          });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ err, type: v1.type, category: v1.category }, 'rubitime create-record failed');
        return reply.code(502).send({ ok: false, error: msg });
      }
    }
  });

  app.post('/api/bersoncare/rubitime/slots', async (request, reply) => {
    const g = guard(request);
    if (!g.ok) {
      return reply.code(g.code).send({ ok: false, error: g.err });
    }
    const parsed = parseRubitimeSlotsQuery(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_slots_query' });
    }
    const q = parsed.data;

    if ('version' in q && q.version === 'v2') {
      const branchId = parseRubitimeNumericId(q.rubitimeBranchId);
      const cooperatorId = parseRubitimeNumericId(q.rubitimeCooperatorId);
      const serviceId = parseRubitimeNumericId(q.rubitimeServiceId);
      if (branchId === null || cooperatorId === null || serviceId === null) {
        return reply.code(400).send({ ok: false, error: 'invalid_rubitime_ids' });
      }
      const durationMinutes = q.slotDurationMinutes;
      const dateFilter = q.dateFrom ?? q.dateTo;
      try {
        const raw = await fetchRubitimeSchedule({
          params: { branchId, cooperatorId, serviceId },
        });
        const branchTimezone = await getBranchTzWithIncident(String(branchId));
        const slots = normalizeRubitimeSchedule(raw, durationMinutes, branchTimezone, dateFilter);
        return reply.code(200).send({ ok: true, slots });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith('RUBITIME_SCHEDULE_MALFORMED_DATA')) {
          logger.warn({ err }, 'rubitime slots: malformed schedule data from Rubitime API');
          return reply.code(502).send({ ok: false, error: 'rubitime_schedule_malformed' });
        }
        logger.warn({ err }, 'rubitime slots failed (v2)');
        return reply.code(502).send({ ok: false, error: msg });
      }
    } else {
      const v1 = q as RubitimeSlotsQueryV1;
      if (!isLegacyBookingProfileResolveEnabled()) {
        return reply.code(400).send({ ok: false, error: ERR_LEGACY_RESOLVE_DISABLED });
      }

      const scheduleParams = await resolveScheduleParams({
        type: v1.type,
        category: v1.category,
        ...(v1.city ? { city: v1.city } : {}),
      });
      if (!scheduleParams) {
        logger.warn({ query: v1 }, 'rubitime slots: no schedule mapping for query');
        return reply.code(400).send({ ok: false, error: 'slots_mapping_not_configured' });
      }
      try {
        const raw = await fetchRubitimeSchedule({ params: scheduleParams });
        const branchTimezone = await getBranchTzWithIncident(String(scheduleParams.branchId));
        const slots = normalizeRubitimeSchedule(
          raw,
          scheduleParams.durationMinutes,
          branchTimezone,
          v1.date,
        );
        return reply.code(200).send({ ok: true, slots });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith('RUBITIME_SCHEDULE_MALFORMED_DATA')) {
          logger.warn({ err }, 'rubitime slots: malformed schedule data from Rubitime API');
          return reply.code(502).send({ ok: false, error: 'rubitime_schedule_malformed' });
        }
        logger.warn({ err }, 'rubitime slots failed');
        return reply.code(502).send({ ok: false, error: msg });
      }
    }
  });

  app.post('/api/bersoncare/rubitime/booking-event', async (request, reply) =>
    handleBookingEventRequest(
      request,
      reply,
      'rubitime booking-event',
      guard,
      dispatchPort,
      deps,
    ),
  );
}
