import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAuthenticatedApiSession } from "@/app-layer/guards/requireRole";
import { logServerRuntimeError } from "@/app-layer/logging/serverRuntimeLog";
import { resolvePatientCanViewAuthOnlyContent } from "@/app-layer/platform-access";

export async function GET() {
  const gate = await requireAuthenticatedApiSession();
  if (!gate.ok) return gate.response;
  const session = gate.session;
  const deps = buildAppDeps();

  const role = session.user.role;
  let contentSections: Awaited<ReturnType<typeof deps.contentSections.listVisible>> = [];
  if (role === "client") {
    try {
      const canView = await resolvePatientCanViewAuthOnlyContent(session);
      contentSections = await deps.contentSections.listVisible({ viewAuthOnlySections: canView });
    } catch (err) {
      logServerRuntimeError("api/menu", err);
    }
  }

  return NextResponse.json({
    ok: true,
    items: deps.menu.getMenuForRole(role, { contentSections }),
  });
}
