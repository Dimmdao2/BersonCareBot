/**
 * GET /api/doctor/clients/search?q=&limit= — быстрый поиск пациента по имени или телефону (календарь, формы).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { isDoctorClientSearchQueryAllowed } from "@/modules/doctor-clients/clientSearchMatch";
import { canAccessDoctor } from "@/modules/roles/service";

const querySchema = z.object({
  q: z.string().max(200).optional().default(""),
  limit: z.coerce.number().int().min(1).max(30).optional().default(20),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const q = parsed.data.q.trim();
  if (!isDoctorClientSearchQueryAllowed(q)) {
    return NextResponse.json({ ok: true, clients: [] });
  }

  const deps = buildAppDeps();
  const clients = await deps.doctorClients.listClients({ search: q });
  return NextResponse.json({
    ok: true,
    clients: clients.slice(0, parsed.data.limit).map((c) => ({
      id: c.userId,
      displayName: c.displayName,
      phone: c.phone,
    })),
  });
}
