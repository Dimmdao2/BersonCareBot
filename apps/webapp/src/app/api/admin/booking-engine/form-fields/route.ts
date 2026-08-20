import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireClinicManagementBookingEngine } from '../_requireClinicManagementBookingEngine';
import {
  BOOKING_FORM_FIELD_KEY_MAX_LENGTH,
  BOOKING_FORM_FIELD_KEY_PATTERN,
  BOOKING_FORM_FIELD_TYPES,
} from '@/modules/booking-form/fieldTypes';

/** A rejected body reaches the screen as this sentence, never as the machine code. */
const INVALID_BODY_MESSAGE = 'Данные вопроса заполнены неверно. Проверьте их и повторите действие.';

const upsertBody = z
  .object({
    id: z.string().uuid().optional(),
    fieldKey: z
      .string()
      .trim()
      .min(1)
      .max(BOOKING_FORM_FIELD_KEY_MAX_LENGTH)
      .regex(BOOKING_FORM_FIELD_KEY_PATTERN),
    fieldType: z.enum(BOOKING_FORM_FIELD_TYPES),
    label: z.string().trim().min(1).max(200),
    placeholder: z.string().max(500).optional(),
    isRequired: z.boolean(),
    visibleToPatient: z.boolean(),
    visibleToStaff: z.boolean(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
  })
  .strict();

function pgErrorFacts(error: unknown): { code: string; constraint: string } {
  if (typeof error !== 'object' || error === null) return { code: '', constraint: '' };
  const value = error as {
    code?: unknown;
    constraint?: unknown;
    cause?: { code?: unknown; constraint?: unknown };
  };
  return {
    code:
      typeof value.code === 'string'
        ? value.code
        : typeof value.cause?.code === 'string'
          ? value.cause.code
          : '',
    constraint:
      typeof value.constraint === 'string'
        ? value.constraint
        : typeof value.cause?.constraint === 'string'
          ? value.cause.constraint
          : '',
  };
}

export async function GET() {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingForm) {
    return NextResponse.json({ ok: false, error: 'booking_engine_unavailable' }, { status: 503 });
  }
  const fields = await deps.bookingForm.listAdminFields(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, fields });
}

export async function POST(request: Request) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'booking');
  if (!entitlement.ok) return entitlement.response;
  const parsed = upsertBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', message: INVALID_BODY_MESSAGE },
      { status: 400 },
    );
  }
  const deps = buildAppDeps();
  if (!deps.bookingForm) {
    return NextResponse.json({ ok: false, error: 'booking_engine_unavailable' }, { status: 503 });
  }
  const bookingForm = deps.bookingForm;
  try {
    const field = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'admin.booking-engine.form-fields.upsert',
      () =>
        bookingForm.upsertAdminField(gate.ctx.organizationId, {
          ...parsed.data,
          placeholder: parsed.data.placeholder ?? null,
        }),
    );
    return NextResponse.json({ ok: true, field });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const pg = pgErrorFacts(error);
    if (
      pg.code === '23505' &&
      (pg.constraint === '' || pg.constraint === 'uq_be_booking_form_fields_org_key')
    ) {
      return NextResponse.json({ ok: false, error: 'field_key_already_exists' }, { status: 409 });
    }
    if (message === 'booking_form_field_not_found') {
      return NextResponse.json({ ok: false, error: 'field_not_found' }, { status: 404 });
    }
    if (pg.code === '42501') {
      console.error('[booking-form-field] capability denied', {
        operation: parsed.data.id ? 'update' : 'create',
        code: pg.code,
      });
      return NextResponse.json(
        { ok: false, error: 'booking_form_capability_unavailable' },
        { status: 503 },
      );
    }
    console.error('[booking-form-field] mutation failed', {
      operation: parsed.data.id ? 'update' : 'create',
      errorClass: error instanceof Error ? error.name : 'unknown',
      code: pg.code || 'unknown',
    });
    return NextResponse.json({ ok: false, error: 'booking_form_write_failed' }, { status: 503 });
  }
}
