import { NextResponse } from 'next/server';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';
import { z } from 'zod';
import { withDoctorLeadsApiAccess } from '@/app-layer/leads/withDoctorLeadsApiAccess';
const patchBody = z.union([
  z.object({ action: z.literal('accept') }).strict(),
  z.object({ action: z.literal('close') }).strict(),
  z
    .object({
      action: z.literal('reject'),
      comment: z.string().trim().max(4_000).nullish(),
    })
    .strict(),
  z.object({ action: z.enum(['archive', 'unarchive']) }).strict(),
]);

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const { id } = await route.params;
  const result = await withDoctorLeadsApiAccess('read', 'doctor.leads.read', ({ ctx, leads }) =>
    leads.get(ctx.organizationId, id),
  );
  if (!result.ok) return result.response;
  return result.value
    ? NextResponse.json({ ok: true, lead: result.value })
    : NextResponse.json({ ok: false, error: 'lead_not_found' }, { status: 404 });
}

export async function PATCH(request: Request, route: { params: Promise<{ id: string }> }) {
  const { id } = await route.params;
  const result = await withDoctorLeadsApiAccess(
    'mutation',
    'doctor.leads.change',
    async ({ ctx, leads }) => {
      const parsed = patchBody.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
      }
      try {
        const lead = await (() => {
          switch (parsed.data.action) {
            case 'accept':
              return leads.accept(ctx.organizationId, id);
            case 'close':
              return leads.close(ctx.organizationId, id);
            case 'reject':
              return leads.reject({
                organizationId: ctx.organizationId,
                leadId: id,
                comment: parsed.data.comment,
              });
            case 'archive':
              return leads.archive(ctx.organizationId, id);
            case 'unarchive':
              return leads.unarchive(ctx.organizationId, id);
          }
        })();
        return lead
          ? NextResponse.json({ ok: true, lead })
          : NextResponse.json({ ok: false, error: 'lead_not_found' }, { status: 404 });
      } catch (error) {
        // Наружу уходит либо ЕДИНСТВЕННЫЙ предметный код перехода, либо безопасный отказ с digest:
        // `error.message` в ответе отдавал бы человеку текст любого внутреннего исключения.
        if (error instanceof Error && error.message === 'lead_status_transition_invalid') {
          return NextResponse.json(
            { ok: false, error: 'lead_status_transition_invalid' },
            { status: 409 },
          );
        }
        // 503 и для предметной, и для неопознанной: до этой правки маршрут отвечал 503 на всё, кроме
        // запрещённого перехода, и менять это молча вместе с закрытием утечки текста нельзя.
        return respondWithSafeApiError('api/doctor/leads/[id]', error, {
          fallbackCode: 'lead_change_failed',
          fallbackStatus: 503,
          domainStatus: 503,
        });
      }
    },
  );
  return result.ok ? result.value : result.response;
}
