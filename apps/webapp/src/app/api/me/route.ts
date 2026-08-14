import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireAuthenticatedIdentitySelfApiSession } from '@/app-layer/guards/requireRole';
import { webappRuntimeDatabaseIsConfigured } from '@/config/env';
import { renewSessionCookieFromRequest } from '@/modules/auth/service';
import type { PlatformAccessContext } from '@/modules/platform-access';
import { resolvePlatformAccessContext } from '@/app-layer/platform-access';

type MePlatformAccessPayload = Pick<
  PlatformAccessContext,
  'canonicalUserId' | 'dbRole' | 'tier' | 'hasPhoneInDb' | 'phoneTrustedForPatient' | 'resolution'
>;

export async function GET() {
  const gate = await requireAuthenticatedIdentitySelfApiSession();
  if (!gate.ok) return gate.response;
  const session = gate.session;
  const deps = buildAppDeps();

  await renewSessionCookieFromRequest();

  let platformAccess: MePlatformAccessPayload | null = null;
  let platformAccessUnresolved = false;
  if (webappRuntimeDatabaseIsConfigured()) {
    try {
      const ctx = await resolvePlatformAccessContext({
        sessionUserId: session.user.userId,
        sessionRoleHint: session.user.role,
      });
      platformAccess = {
        canonicalUserId: ctx.canonicalUserId,
        dbRole: ctx.dbRole,
        tier: ctx.tier,
        hasPhoneInDb: ctx.hasPhoneInDb,
        phoneTrustedForPatient: ctx.phoneTrustedForPatient,
        resolution: ctx.resolution,
      };
    } catch {
      platformAccess = null;
      platformAccessUnresolved = true;
    }
  }

  return NextResponse.json({
    ok: true,
    user: deps.users.getCurrentUser(session),
    postLoginHints: session.postLoginHints,
    platformAccess,
    ...(platformAccessUnresolved ? { platformAccessUnresolved: true as const } : {}),
  });
}
