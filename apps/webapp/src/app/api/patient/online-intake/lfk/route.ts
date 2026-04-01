import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";

const bodySchema = z.object({
  description: z.string().min(20, "description_too_short").max(5000, "description_too_long"),
  attachmentUrls: z.array(z.string().url()).max(5).optional(),
  attachmentFileIds: z.array(z.string()).max(10).optional(),
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!canAccessPatient(session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const service = getOnlineIntakeService();
  try {
    const result = await service.submitLfk({
      userId: session.user.userId,
      patientName: session.user.displayName ?? "",
      patientPhone: session.user.phone ?? "",
      description: parsed.data.description,
      attachmentUrls: parsed.data.attachmentUrls,
      attachmentFileIds: parsed.data.attachmentFileIds,
    });
    return NextResponse.json(
      { id: result.id, type: result.type, status: result.status, createdAt: result.createdAt },
      { status: 201 },
    );
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err) {
      if ((err as { code: string }).code === "VALIDATION_ERROR") {
        return NextResponse.json({ error: "VALIDATION_ERROR", message: err.message }, { status: 400 });
      }
      if ((err as { code: string }).code === "RATE_LIMIT") {
        return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429 });
      }
    }
    throw err;
  }
}
