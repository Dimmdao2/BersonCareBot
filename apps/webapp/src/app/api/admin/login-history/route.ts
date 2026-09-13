/**
 * GET /api/admin/login-history?userId=… ИЛИ ?ip=… — история входов (#1112).
 *
 * Дверь узкая по построению, как и у слияния учётных записей: она отвечает на конкретный вопрос
 * («входы этой учётной записи» или «кто входил с этого адреса») и не умеет отдать ленту всех входов
 * всех людей. Ровно один из двух параметров обязателен.
 *
 * Наружу уходят учётные данные: когда, чем вошли, роль, адрес, устройство. Медицинских данных в
 * этом журнале нет и быть не может (канон Р-АДМИН).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listUserLoginEvents } from '@/app-layer/admin/loginHistory';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';

const querySchema = z
  .object({
    userId: z.string().uuid().optional(),
    ip: z.string().trim().min(1).max(45).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((q) => (q.userId == null) !== (q.ip == null), {
    message: 'exactly one of userId / ip is required',
  });

export async function GET(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const q = parsed.data;
  const result = await listUserLoginEvents({
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.ip ? { ip: q.ip } : {}),
    page: q.page,
    limit: q.limit,
  });

  return NextResponse.json({
    ok: true,
    items: result.items.map((row) => ({
      id: row.id,
      userId: row.user_id,
      occurredAt: row.occurred_at.toISOString(),
      outcome: row.outcome,
      failureReason: row.failure_reason,
      method: row.method,
      role: row.role,
      ip: row.ip,
      userAgent: row.user_agent,
      deviceKind: row.device_kind,
      os: row.os,
      browser: row.browser,
      host: row.host,
      deviceId: row.device_id,
      country: row.country,
    })),
    total: result.total,
    page: result.page,
    limit: result.limit,
  });
}
