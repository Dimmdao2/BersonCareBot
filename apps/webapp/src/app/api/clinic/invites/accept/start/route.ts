import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import { startEmailChallenge, normalizeEmail } from '@/modules/auth/emailAuth';
import { jsonError, jsonOk } from '@/shared/http/apiResponse';
import { platformMailProfile } from '@/modules/auth/mailProfile';
import { STAFF_SURFACE } from '@/config/productSurfaces';

const bodySchema = z.object({
  token: z.string().trim().min(16),
  email: z.string().optional(),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/clinic/invites/accept/start:POST', request);
  if (!(await isAuthChannelEnabled('email'))) {
    return jsonError(AUTH_CHANNEL_DISABLED_ERROR, {}, { status: 503 });
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('invalid_body', {}, { status: 400 });
  }

  const deps = buildAppDeps();
  const lookup = await deps.organizationInvites.lookupPendingByToken(parsed.data.token);
  if (!lookup.ok) {
    return jsonError(lookup.code, {}, { status: 400 });
  }

  const suppliedEmail = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
  if (suppliedEmail && suppliedEmail !== lookup.invite.invitedEmail) {
    return jsonError('email_mismatch', {}, { status: 400 });
  }

  const user = await deps.emailOtpPublicDb.findOrCreatePublicEmailUser(lookup.invite.invitedEmail);
  const challenge = await startEmailChallenge(
    user.userId,
    lookup.invite.invitedEmail,
    'clinic_invite',
    platformMailProfile(STAFF_SURFACE.name),
  );
  if (!challenge.ok) {
    const status =
      challenge.code === 'rate_limited' || challenge.code === 'too_many_attempts' ? 429 : 503;
    return jsonError(
      challenge.code,
      { retryAfterSeconds: challenge.retryAfterSeconds },
      {
        status,
        ...(challenge.retryAfterSeconds != null
          ? { headers: { 'Retry-After': String(challenge.retryAfterSeconds) } }
          : {}),
      },
    );
  }

  return jsonOk({
    challengeId: challenge.challengeId,
    retryAfterSeconds: challenge.retryAfterSeconds,
  });
}
