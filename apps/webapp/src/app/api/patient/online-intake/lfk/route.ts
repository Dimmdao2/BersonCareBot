import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiSessionWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";

const bodySchema = z.object({
  description: z.string().min(20, "description_too_short").max(5000, "description_too_long"),
  attachmentUrls: z.array(z.string().url()).max(5).optional(),
  /** Each item is `media_files.id` (UUID) for a file owned by the patient in `ready` (or legacy readable) state. */
  attachmentFileIds: z.array(z.string().uuid()).max(10).optional(),
});

export async function POST(request: Request) {
  const gate = await requirePatientApiSessionWithPhone({ returnPath: routePaths.intakeLfk });
  if (!gate.ok) return gate.response;
  const session = gate.session;

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
      const code = (err as { code: string }).code;
      if (code === "VALIDATION_ERROR") {
        return NextResponse.json({ error: "VALIDATION_ERROR", message: err.message }, { status: 400 });
      }
      if (code === "ATTACHMENT_FILE_INVALID") {
        return NextResponse.json({ error: "ATTACHMENT_FILE_INVALID", message: err.message }, { status: 400 });
      }
      if (code === "ATTACHMENT_FILE_FORBIDDEN") {
        return NextResponse.json({ error: "ATTACHMENT_FILE_FORBIDDEN", message: err.message }, { status: 403 });
      }
      if (code === "RATE_LIMIT") {
        return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429 });
      }
    }
    throw err;
  }
}
