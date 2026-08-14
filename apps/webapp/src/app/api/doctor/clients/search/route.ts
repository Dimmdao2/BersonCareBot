/**
 * GET /api/doctor/clients/search?q=&limit= — быстрый поиск пациента по имени или телефону (календарь, формы).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { formatDoctorFio } from '@/shared/lib/fio';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { isDoctorClientSearchQueryAllowed } from '@/modules/doctor-clients/clientSearchMatch';

const querySchema = z.object({
  q: z.string().max(200).optional().default(''),
  limit: z.coerce.number().int().min(1).max(30).optional().default(20),
});

export async function GET(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const q = parsed.data.q.trim();
  if (!isDoctorClientSearchQueryAllowed(q)) {
    return NextResponse.json({ ok: true, clients: [] });
  }

  const deps = buildAppDeps();
  const clients = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.doctorClients.listClients({
      search: q,
      organizationId: gate.ctx.organizationId,
      visibilityActor: gate.ctx,
    }),
  );
  return NextResponse.json({
    ok: true,
    clients: clients.slice(0, parsed.data.limit).map((c) => ({
      id: c.userId,
      displayName: formatDoctorFio(
        {
          lastName: c.lastName ?? null,
          firstName: c.firstName ?? null,
          patronymic: c.patronymic ?? null,
        },
        c.displayName,
      ),
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      patronymic: c.patronymic ?? null,
      phone: c.phone,
    })),
  });
}
