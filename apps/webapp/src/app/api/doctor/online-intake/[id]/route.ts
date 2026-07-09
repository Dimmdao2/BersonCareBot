import { NextResponse } from "next/server";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { buildDoctorOnlineIntakeDetailResponse } from "@/modules/online-intake/doctorIntakeDetailResponse";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const service = getOnlineIntakeService();
  const result = await withDoctorWorkspacePrincipal(gate.ctx, () => service.getRequestForDoctor(id));
  if (!result || result.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const json = await buildDoctorOnlineIntakeDetailResponse(result);
  return NextResponse.json(json);
}
