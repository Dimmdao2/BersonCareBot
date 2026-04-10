import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import type { PlatformAccessContext } from "@/modules/platform-access";
import { resolvePlatformAccessContext } from "@/modules/platform-access";

type MePlatformAccessPayload = Pick<
  PlatformAccessContext,
  "canonicalUserId" | "dbRole" | "tier" | "hasPhoneInDb" | "phoneTrustedForPatient" | "resolution"
>;

export async function GET() {
  const deps = buildAppDeps();
  const session = await deps.auth.getCurrentSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const pinRow = await deps.userPins.getByUserId(session.user.userId);

  let platformAccess: MePlatformAccessPayload | null = null;
  if (env.DATABASE_URL?.trim()) {
    try {
      const ctx = await resolvePlatformAccessContext(getPool(), {
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
    }
  }

  return NextResponse.json({
    ok: true,
    user: deps.users.getCurrentUser(session),
    security: {
      hasPin: pinRow != null,
    },
    postLoginHints: session.postLoginHints,
    platformAccess,
  });
}
