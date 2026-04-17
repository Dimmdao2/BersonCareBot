import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logServerRuntimeError } from "@/app-layer/logging/serverRuntimeLog";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";

export async function GET() {
  const deps = buildAppDeps();
  const session = await deps.auth.getCurrentSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

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
