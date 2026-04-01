import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";

const querySchema = z.object({
  type: z.enum(["lfk", "nutrition"]).optional(),
  status: z.enum(["new", "in_review", "contacted", "closed"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
  }

  const { page, limit, type, status } = parsed.data;
  const offset = (page - 1) * limit;

  const service = getOnlineIntakeService();
  const result = await service.listForDoctor({ type, status, limit, offset });

  return NextResponse.json({
    ...result,
    page,
    totalPages: Math.ceil(result.total / limit),
  });
}
