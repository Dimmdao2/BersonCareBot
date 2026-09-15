import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { normalizeEmail } from '@/modules/auth/emailNormalize';
import { jsonError, jsonOk } from '@/shared/http/apiResponse';

const bodySchema = z.object({ email: z.string().min(1) });

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/leads/public/captcha:POST', request);
  ensureAuthModulePortsBound();
  const parsed = bodySchema.safeParse((await request.json().catch(() => null)) as unknown);
  const email = parsed.success ? normalizeEmail(parsed.data.email) : null;
  if (!email) return jsonError('invalid_email', {}, { status: 400 });
  const challenge = await buildAppDeps().passwordAltcha.issuePublicLead(email);
  return challenge ? jsonOk(challenge) : jsonError('captcha_unavailable', {}, { status: 503 });
}
