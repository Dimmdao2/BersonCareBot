import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";

const querySchema = z.object({
  type: z.enum(["lfk", "nutrition"]).optional(),
  status: z.enum(["new", "in_review", "contacted", "closed"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!canAccessPatient(session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
  }

  const service = getOnlineIntakeService();
  const result = await service.listMyRequests({
    userId: session.user.userId,
    type: parsed.data.type,
    status: parsed.data.status,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  });

  return NextResponse.json(result);
}
