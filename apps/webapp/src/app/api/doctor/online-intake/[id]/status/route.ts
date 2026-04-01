import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";

const bodySchema = z.object({
  status: z.enum(["in_review", "contacted", "closed"]),
  note: z.string().max(500).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  const service = getOnlineIntakeService();
  try {
    const result = await service.changeStatus({
      requestId: id,
      changedBy: session.user.userId,
      toStatus: parsed.data.status,
      note: parsed.data.note,
    });
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
