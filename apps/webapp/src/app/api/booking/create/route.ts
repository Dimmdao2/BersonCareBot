import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientBookingTrustedPhoneAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import {
  InPersonBookingResolveError,
  resolveCurrentPatientInPersonBookingContext,
} from '@/modules/patient-booking/inPersonBookingResolve';
import {
  contactFioFieldSchema,
  inPersonCreateBodySchema,
} from '@/modules/patient-booking/inPersonApiSchemas';
import {
  jsonError,
  jsonOk,
  mapApiError,
  type ApiErrorLiteralRules,
} from '@/shared/http/apiResponse';
import { FIO_LATIN_REJECTED_TEXT, isFioLatinRejection } from '@/shared/lib/fio';

const formAnswerSchema = z.object({
  fieldKey: z.string().min(1),
  value: z.string(),
});

const onlineBody = z.object({
  type: z.literal('online'),
  category: z.enum(['rehab_lfk', 'nutrition', 'general']),
  city: z.string().trim().optional(),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  slotCount: z.coerce.number().int().min(1).max(8).optional(),
  contactName: z.string().min(1),
  contactFio: contactFioFieldSchema,
  contactPhone: z.string().min(1),
  contactEmail: z.string().email().optional(),
  formAnswers: z.array(formAnswerSchema).optional(),
});

const inPersonBody = inPersonCreateBodySchema;

const bodySchema = z.discriminatedUnion('type', [onlineBody, inPersonBody]);

const IN_PERSON_RESOLVE_ERROR_RULES = {
  ambiguous_booking_tenant: { status: 400, code: 'ambiguous_booking_tenant' },
  booking_scheduling_unavailable: { status: 400, code: 'booking_scheduling_unavailable' },
  branch_not_found: { status: 400, code: 'branch_not_found' },
  branch_service_mapping_missing: { status: 404, code: 'branch_service_mapping_missing' },
  branch_service_not_found: { status: 400, code: 'branch_service_not_found' },
  invalid_in_person_keys: { status: 400, code: 'invalid_in_person_keys' },
} as const satisfies ApiErrorLiteralRules;

const BOOKING_CREATE_ERROR_RULES = {
  booking_blocked: { status: 403, code: 'booking_blocked' },
  booking_confirm_failed: { status: 503, code: 'booking_confirm_failed' },
  branch_service_not_found: { status: 404, code: 'branch_service_not_found' },
  canonical_booking_unavailable: { status: 503, code: 'canonical_booking_unavailable' },
  catalog_unavailable: { status: 503, code: 'catalog_unavailable' },
  city_mismatch: { status: 400, code: 'city_mismatch' },
  consecutive_slot_cap_exceeded: { status: 400, code: 'consecutive_slot_cap_exceeded' },
  duplicate_local_booking_id: { status: 409, code: 'duplicate_local_booking_id' },
  integrator_not_configured: { status: 503, code: 'integrator_not_configured' },
  invalid_branch_service_id: { status: 400, code: 'invalid_branch_service_id' },
  invalid_city_code: { status: 400, code: 'invalid_city_code' },
  invalid_contact_name: { status: 400, code: 'invalid_contact_name' },
  invalid_contact_phone: { status: 400, code: 'invalid_contact_phone' },
  invalid_datetime: { status: 400, code: 'invalid_datetime' },
  invalid_email: { status: 400, code: 'invalid_email' },
  invalid_phone: { status: 400, code: 'invalid_phone' },
  invalid_slot_count: { status: 400, code: 'invalid_slot_count' },
  invalid_slot_range: { status: 400, code: 'invalid_slot_range' },
  package_expired: { status: 409, code: 'package_expired' },
  package_no_balance: { status: 409, code: 'package_no_balance' },
  package_not_active: { status: 409, code: 'package_not_active' },
  package_not_found: { status: 409, code: 'package_not_found' },
  package_reserve_failed: { status: 409, code: 'package_reserve_failed' },
  payment_provider_unavailable: { status: 422, code: 'payment_provider_unavailable' },
  payments_disabled: { status: 422, code: 'payments_disabled' },
  required_field_missing: { status: 400, code: 'required_field_missing' },
  slot_already_taken: { status: 409, code: 'slot_already_taken' },
  slot_overlap: { status: 409, code: 'slot_overlap' },
} as const satisfies ApiErrorLiteralRules;

export async function POST(request: Request) {
  const gate = await requirePatientBookingTrustedPhoneAccess({
    returnPath: routePaths.patientBooking,
  });
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      'invalid_body',
      isFioLatinRejection(parsed) ? { message: FIO_LATIN_REJECTED_TEXT } : {},
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  const body = parsed.data;
  try {
    if (body.type === 'online') {
      return jsonError('ambiguous_booking_tenant', {}, { status: 400 });
    }
    const ctx = await resolveCurrentPatientInPersonBookingContext(deps, body);
    const cityCode = ctx.cityCode?.trim().toLowerCase();
    if (!cityCode) throw new InPersonBookingResolveError('branch_not_found');
    const booking = await deps.patientBooking.createBooking({
          userId: session.user.userId,
          organizationId: ctx.organizationId,
          type: 'in_person',
          branchId: ctx.branchId,
          serviceId: ctx.serviceId,
          cityCode,
          slotStart: body.slotStart,
          slotEnd: body.slotEnd,
          slotCount: body.slotCount,
          contactName: body.contactName,
          contactFio: body.contactFio,
          contactPhone: body.contactPhone,
          contactEmail: body.contactEmail,
          formAnswers: body.formAnswers,
          patientPackageId: body.patientPackageId,
    });
    let checkoutUrl: string | null = null;
    if (booking.status === 'awaiting_payment') {
      const paymentStatus = await deps.patientBooking.getBookingPaymentStatus(
        booking.id,
        session.user.userId,
      );
      checkoutUrl = paymentStatus.ok ? (paymentStatus.summary?.intent?.checkoutUrl ?? null) : null;
    }
    return jsonOk({ booking, checkoutUrl }, { status: 200 });
  } catch (error) {
    const mapped = mapApiError(
      error,
      BOOKING_CREATE_ERROR_RULES,
      { status: 503, code: 'create_failed' },
      [
        {
          matches: (candidate: unknown): candidate is InPersonBookingResolveError =>
            candidate instanceof InPersonBookingResolveError,
          literalRules: IN_PERSON_RESOLVE_ERROR_RULES,
        },
      ],
    );
    return jsonError(mapped.code, mapped.publicFields ?? {}, {
      status: mapped.status,
      headers: mapped.headers,
    });
  }
}
