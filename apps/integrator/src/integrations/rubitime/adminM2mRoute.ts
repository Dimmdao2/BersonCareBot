/**
 * Admin M2M routes для управления справочниками Rubitime и профилями записи.
 *
 * Все маршруты защищены тем же HMAC-SHA256 guard, что и booking M2M.
 * Вызывается только из webapp admin (signed M2M).
 *
 * Префикс: /api/bersoncare/rubitime/admin
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { logger } from '../../infra/observability/logger.js';
import { createDbPort } from '../../infra/db/client.js';
import {
  listBranches,
  upsertBranch,
  deactivateBranch,
  listServices,
  upsertService,
  deactivateService,
  listCooperators,
  upsertCooperator,
  deactivateCooperator,
  listBookingProfiles,
  upsertBookingProfileByIndex,
  deactivateBookingProfile,
} from './db/bookingProfilesRepo.js';

const MAX_TIMESTAMP_AGE_SECONDS = 300;

function verifySignature(request: FastifyRequest, secret: string): boolean {
  const tsHeader = request.headers['x-bersoncare-timestamp'];
  const sigHeader = request.headers['x-bersoncare-signature'];
  if (typeof tsHeader !== 'string' || typeof sigHeader !== 'string') return false;
  const ts = parseInt(tsHeader, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > MAX_TIMESTAMP_AGE_SECONDS) return false;
  const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  const expected = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('base64url');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader));
  } catch {
    return false;
  }
}

function guard(request: FastifyRequest, secret: string): { ok: true } | { ok: false; code: number; err: string } {
  if (!secret) return { ok: false, code: 503, err: 'service_unconfigured' };
  if (!verifySignature(request, secret)) return { ok: false, code: 401, err: 'invalid_signature' };
  return { ok: true };
}

// ---- Input schemas ----

const UpsertBranchSchema = z.object({
  rubitimeBranchId: z.number().int().positive(),
  cityCode: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
});

const UpsertServiceSchema = z.object({
  rubitimeServiceId: z.number().int().positive(),
  title: z.string().min(1).max(200),
  categoryCode: z.string().min(1).max(50),
  durationMinutes: z.number().int().positive().max(480),
});

const UpsertCooperatorSchema = z.object({
  rubitimeCooperatorId: z.number().int().positive(),
  title: z.string().min(1).max(200),
});

const UpsertBookingProfileSchema = z.object({
  bookingType: z.enum(['online', 'in_person']),
  categoryCode: z.string().min(1).max(50),
  cityCode: z.string().min(1).max(50).nullable().optional(),
  branchId: z.number().int().positive(),
  serviceId: z.number().int().positive(),
  cooperatorId: z.number().int().positive(),
});

const IdSchema = z.object({ id: z.string().regex(/^\d+$/) });

// ---- Route registration ----

export async function registerRubitimeAdminM2mRoutes(
  app: FastifyInstance,
  opts: { sharedSecret: string },
): Promise<void> {
  const { sharedSecret } = opts;

  // ---- Branches ----

  app.get('/api/bersoncare/rubitime/admin/branches', async (request, reply) => {
    const g = guard(request, sharedSecret);
    if (!g.ok) return reply.code(g.code).send({ ok: false, error: g.err });
    try {
      const db = createDbPort();
      const branches = await listBranches(db);
      return reply.code(200).send({ ok: true, branches });
    } catch (err) {
      logger.warn({ err }, 'rubitime admin: listBranches failed');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });

  app.post('/api/bersoncare/rubitime/admin/branches', async (request, reply) => {
    const g = guard(request, sharedSecret);
    if (!g.ok) return reply.code(g.code).send({ ok: false, error: g.err });
    const parsed = UpsertBranchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_input' });
    try {
      const db = createDbPort();
      const branch = await upsertBranch(db, {
        ...parsed.data,
        address: parsed.data.address ?? '',
      });
      return reply.code(200).send({ ok: true, branch });
    } catch (err) {
      logger.warn({ err }, 'rubitime admin: upsertBranch failed');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });

  app.delete('/api/bersoncare/rubitime/admin/branches/:id', async (request, reply) => {
    const g = guard(request, sharedSecret);
    if (!g.ok) return reply.code(g.code).send({ ok: false, error: g.err });
    const params = IdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ ok: false, error: 'invalid_id' });
    try {
      const db = createDbPort();
      await deactivateBranch(db, Number(params.data.id));
      return reply.code(200).send({ ok: true });
    } catch (err) {
      logger.warn({ err }, 'rubitime admin: deactivateBranch failed');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });

  // ---- Services ----

  app.get('/api/bersoncare/rubitime/admin/services', async (request, reply) => {
    const g = guard(request, sharedSecret);
    if (!g.ok) return reply.code(g.code).send({ ok: false, error: g.err });
    try {
      const db = createDbPort();
      const services = await listServices(db);
      return reply.code(200).send({ ok: true, services });
    } catch (err) {
      logger.warn({ err }, 'rubitime admin: listServices failed');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });

  app.post('/api/bersoncare/rubitime/admin/services', async (request, reply) => {
    const g = guard(request, sharedSecret);
    if (!g.ok) return reply.code(g.code).send({ ok: false, error: g.err });
    const parsed = UpsertServiceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_input' });
    try {
      const db = createDbPort();
      const service = await upsertService(db, parsed.data);
      return reply.code(200).send({ ok: true, service });
    } catch (err) {
      logger.warn({ err }, 'rubitime admin: upsertService failed');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });

  app.delete('/api/bersoncare/rubitime/admin/services/:id', async (request, reply) => {
    const g = guard(request, sharedSecret);
    if (!g.ok) return reply.code(g.code).send({ ok: false, error: g.err });
    const params = IdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ ok: false, error: 'invalid_id' });
    try {
      const db = createDbPort();
      await deactivateService(db, Number(params.data.id));
      return reply.code(200).send({ ok: true });
    } catch (err) {
      logger.warn({ err }, 'rubitime admin: deactivateService failed');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });

  // ---- Cooperators ----

  app.get('/api/bersoncare/rubitime/admin/cooperators', async (request, reply) => {
    const g = guard(request, sharedSecret);
    if (!g.ok) return reply.code(g.code).send({ ok: false, error: g.err });
    try {
      const db = createDbPort();
      const cooperators = await listCooperators(db);
      return reply.code(200).send({ ok: true, cooperators });
    } catch (err) {
      logger.warn({ err }, 'rubitime admin: listCooperators failed');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });

  app.post('/api/bersoncare/rubitime/admin/cooperators', async (request, reply) => {
    const g = guard(request, sharedSecret);
    if (!g.ok) return reply.code(g.code).send({ ok: false, error: g.err });
    const parsed = UpsertCooperatorSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_input' });
    try {
      const db = createDbPort();
      const cooperator = await upsertCooperator(db, parsed.data);
      return reply.code(200).send({ ok: true, cooperator });
    } catch (err) {
      logger.warn({ err }, 'rubitime admin: upsertCooperator failed');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });

  app.delete('/api/bersoncare/rubitime/admin/cooperators/:id', async (request, reply) => {
    const g = guard(request, sharedSecret);
    if (!g.ok) return reply.code(g.code).send({ ok: false, error: g.err });
    const params = IdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ ok: false, error: 'invalid_id' });
    try {
      const db = createDbPort();
      await deactivateCooperator(db, Number(params.data.id));
      return reply.code(200).send({ ok: true });
    } catch (err) {
      logger.warn({ err }, 'rubitime admin: deactivateCooperator failed');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });

  // ---- Booking Profiles ----

  app.get('/api/bersoncare/rubitime/admin/booking-profiles', async (request, reply) => {
    const g = guard(request, sharedSecret);
    if (!g.ok) return reply.code(g.code).send({ ok: false, error: g.err });
    try {
      const db = createDbPort();
      const profiles = await listBookingProfiles(db);
      return reply.code(200).send({ ok: true, profiles });
    } catch (err) {
      logger.warn({ err }, 'rubitime admin: listBookingProfiles failed');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });

  app.post('/api/bersoncare/rubitime/admin/booking-profiles', async (request, reply) => {
    const g = guard(request, sharedSecret);
    if (!g.ok) return reply.code(g.code).send({ ok: false, error: g.err });
    const parsed = UpsertBookingProfileSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_input' });
    try {
      const db = createDbPort();
      const result = await upsertBookingProfileByIndex(db, {
        ...parsed.data,
        cityCode: parsed.data.cityCode ?? null,
      });
      return reply.code(200).send({ ok: true, id: result.id });
    } catch (err) {
      logger.warn({ err }, 'rubitime admin: upsertBookingProfile failed');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });

  app.delete('/api/bersoncare/rubitime/admin/booking-profiles/:id', async (request, reply) => {
    const g = guard(request, sharedSecret);
    if (!g.ok) return reply.code(g.code).send({ ok: false, error: g.err });
    const params = IdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ ok: false, error: 'invalid_id' });
    try {
      const db = createDbPort();
      await deactivateBookingProfile(db, Number(params.data.id));
      return reply.code(200).send({ ok: true });
    } catch (err) {
      logger.warn({ err }, 'rubitime admin: deactivateBookingProfile failed');
      return reply.code(500).send({ ok: false, error: 'internal_error' });
    }
  });
}
