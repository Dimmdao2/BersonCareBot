import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { getSpecialistSignupEnabled } from '@/modules/auth/specialistSignupRollout';
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from '@/modules/auth/authConfirmRateLimit';
import { jsonError, jsonOk } from '@/shared/http/apiResponse';

const bodySchema = z.object({
  slug: z.string().max(512),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/specialist-signup/slug:POST', request);

  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'specialist_signup_slug');
  if (rateLimit.limited) {
    if (rateLimit.reason === 'proxy_configuration') {
      return jsonError('proxy_configuration', {}, { status: 503 });
    }
    return jsonError(
      'rate_limited',
      { retryAfterSeconds: AUTH_CONFIRM_RATE_LIMIT_SEC },
      { status: 429, headers: { 'Retry-After': String(AUTH_CONFIRM_RATE_LIMIT_SEC) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError('invalid_body', {}, { status: 400 });
  }
  if (!(await getSpecialistSignupEnabled())) {
    return jsonError('specialist_signup_disabled', {}, { status: 423 });
  }

  const service = buildAppDeps().clinicDirectory;
  if (!service) {
    return jsonError('directory_unavailable', {}, { status: 503 });
  }
  const result = await service.checkSlugAvailability(parsed.data.slug);
  if (!result.ok) {
    return jsonError(result.code, {}, { status: result.code === 'slug_unavailable' ? 409 : 400 });
  }
  return jsonOk({ slug: result.slug, available: true });
}
