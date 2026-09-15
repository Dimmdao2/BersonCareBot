import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { withPublicLeadsAccess } from '@/app-layer/leads/withPublicLeadsAccess';
import { jsonError, jsonOk } from '@/shared/http/apiResponse';

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/leads/public/form-fields:GET', request);
  const orgSlug = new URL(request.url).searchParams.get('orgSlug')?.trim() ?? '';
  if (!orgSlug) return jsonError('invalid_query', {}, { status: 400 });
  try {
    const result = await withPublicLeadsAccess(
      orgSlug,
      'api/leads/public/form-fields:GET',
      'read',
      ({ organizationId, deps }) => deps.bookingForm!.listPublicFields(organizationId, 'leads'),
    );
    return result.ok
      ? jsonOk({ fields: result.value })
      : jsonError('not_found', {}, { status: 404 });
  } catch (error) {
    return jsonError({
      error,
      fallback: { code: 'leads_unavailable', status: 503 },
      logEvent: 'public_lead_form_fields_failed',
    });
  }
}
