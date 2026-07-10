import { NextResponse } from "next/server";
import { z } from "zod";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";

const bodySchema = z.object({
  status: z.enum(["in_review", "contacted", "booked", "rejected", "closed"]),
  note: z.string().max(500).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  const service = getOnlineIntakeService();
  try {
    const intake = await withDoctorWorkspacePrincipal(gate.ctx, () => service.getRequestForDoctor(id));
    if (!intake || intake.organizationId !== gate.ctx.organizationId) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const result = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      service.changeStatus({
        requestId: id,
        changedBy: gate.ctx.session.user.userId,
        toStatus: parsed.data.status,
        note: parsed.data.note,
      }),
    );
    return NextResponse.json({ id: result.id, status: result.status, updatedAt: result.updatedAt });
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err) {
      const code = (err as { code: string }).code;
      if (code === "NOT_FOUND") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      if (code === "INVALID_STATUS_TRANSITION") {
        return NextResponse.json({ error: "INVALID_STATUS_TRANSITION" }, { status: 400 });
      }
    }
    throw err;
  }
}
