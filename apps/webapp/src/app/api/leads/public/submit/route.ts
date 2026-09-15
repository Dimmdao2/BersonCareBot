import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { resolveVerifiedLeadApplicant } from '@/app-layer/leads/resolveVerifiedLeadApplicant';
import { withPublicLeadsAccess } from '@/app-layer/leads/withPublicLeadsAccess';
import { normalizeEmail } from '@/modules/auth/emailNormalize';
import { getCurrentSessionForIdentitySelf } from '@/modules/auth/service';
import {
  isPublicBookingCreateRateLimited,
  PUBLIC_BOOKING_RATE_LIMIT_SEC,
  resolvePublicBookingRateLimitClientKey,
} from '@/modules/public-booking/publicBookingRateLimit';
import { jsonError, jsonOk } from '@/shared/http/apiResponse';

const bodySchema = z.object({
  orgSlug: z.string().trim().min(1).max(120),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  patronymic: z.string().trim().max(100).optional(),
  email: z.string().min(1),
  phone: z.string().trim().max(40).optional(),
  preferredContact: z.string().trim().max(40).optional(),
  messageText: z.string().trim().min(1).max(10_000),
  sourceSurface: z.enum(['public_page', 'widget']),
  personalDataConsent: z.literal(true),
  captcha: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/leads/public/submit:POST', request);
  ensureAuthModulePortsBound();
  const parsed = bodySchema.safeParse((await request.json().catch(() => null)) as unknown);
  if (!parsed.success) return jsonError('invalid_body', {}, { status: 400 });
  const body = parsed.data;
  const email = normalizeEmail(body.email);
  if (!email) return jsonError('invalid_email', {}, { status: 400 });

  const session = await getCurrentSessionForIdentitySelf();
  const confirmedEmail = session?.user.contacts?.some(
    (contact) =>
      contact.kind === 'email' &&
      Boolean(contact.confirmedAt) &&
      normalizeEmail(contact.value) === email,
  );
  if (!session || !confirmedEmail) {
    return jsonError('lead_email_verification_required', {}, { status: 403 });
  }

  const deps = buildAppDeps();
  const rateKey = resolvePublicBookingRateLimitClientKey(request);
  if (!rateKey.ok) return jsonError('proxy_configuration', {}, { status: 503 });
  const captcha = await deps.passwordAltcha.verifyPublicLead(email, body.captcha, rateKey.key);
  if (captcha.providerUnavailable) {
    return jsonError('captcha_unavailable', {}, { status: 503 });
  }
  if (!captcha.verifiedExternally) {
    return jsonError('captcha_required', {}, { status: 403 });
  }
  if (await isPublicBookingCreateRateLimited(rateKey.key)) {
    return jsonError(
      'rate_limited',
      { retryAfterSeconds: PUBLIC_BOOKING_RATE_LIMIT_SEC },
      { status: 429, headers: { 'Retry-After': String(PUBLIC_BOOKING_RATE_LIMIT_SEC) } },
    );
  }

  try {
    const result = await withPublicLeadsAccess(
      body.orgSlug,
      'api/leads/public/submit:POST',
      'mutation',
      async ({ organizationId, deps: publicDeps }) => {
        // Состав заявки задаёт КЛИНИКА, а не тело запроса: единственный источник значений ниже —
        // `accepted`, куда валидатор кладёт только ответы на включённые арендатором поля. Поэтому
        // ответ на выключенное поле не доезжает ни до заявки, ни до `resolveVerifiedLeadApplicant`,
        // который по телефону принимает решение о СЛИЯНИИ учётных записей.
        const validation = await publicDeps.bookingForm!.validateAnswers(
          organizationId,
          'patient',
          [
            { fieldKey: 'first_name', value: body.firstName ?? '' },
            { fieldKey: 'last_name', value: body.lastName ?? '' },
            { fieldKey: 'patronymic', value: body.patronymic ?? '' },
            { fieldKey: 'email', value: email },
            { fieldKey: 'phone', value: body.phone ?? '' },
            { fieldKey: 'preferred_contact', value: body.preferredContact ?? '' },
            { fieldKey: 'message', value: body.messageText },
          ],
          undefined,
          'leads',
        );
        if (!validation.ok) throw new Error(validation.error);
        const { accepted } = validation;
        const applicant = await resolveVerifiedLeadApplicant({
          organizationId,
          verifiedEmailUserId: session.user.userId,
          emailNormalized: email,
          submittedPhone: accepted.get('phone') ?? null,
          proof: 'authenticated_session',
        });
        return publicDeps.leads!.submit({
          organizationId,
          applicant,
          firstName: accepted.get('first_name'),
          lastName: accepted.get('last_name'),
          patronymic: accepted.get('patronymic'),
          // Почта берётся из ПОДТВЕРЖДЁННОЙ сессии, а не из конфигурации полей: она доказана
          // отдельно от формы, и заявка без неё не принадлежит никому.
          email,
          phone: accepted.get('phone'),
          preferredContact: accepted.get('preferred_contact'),
          messageText: accepted.get('message') ?? '',
          sourceSurface: body.sourceSurface,
        });
      },
    );
    return result.ok
      ? jsonOk({ leadId: result.value.id }, { status: 201 })
      : jsonError('not_found', {}, { status: 404 });
  } catch (error) {
    return jsonError({
      error,
      literalRules: {
        required_field_missing: { status: 400, code: 'required_field_missing' },
        empty_lead_message: { status: 400, code: 'required_field_missing' },
        invalid_lead_phone: { status: 400, code: 'invalid_phone' },
        invalid_phone: { status: 400, code: 'invalid_phone' },
        lead_identity_merge_conflict: { status: 409, code: 'email_conflict' },
      },
      fallback: { code: 'lead_submit_failed', status: 500 },
      logEvent: 'public_lead_submit_failed',
    });
  }
}
