/**
 * GET  /api/doctor/notification-templates — все шаблоны уведомлений (event×audience) + список переменных
 * PUT  /api/doctor/notification-templates — сохранить один шаблон (event, audience, text)
 * Guard: role === 'doctor' | 'admin' (владелец кабинета)
 *
 * Переиспользует сервис notifTemplatesService (порт Ф1) через buildAppDeps — БЕЗ raw SQL,
 * без дублирования хранилища. Валидация идентична admin-роуту (Ф2).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { systemSettingsOrgContextErrorResponse } from "@/app-layer/guards/systemSettingsOrgContextResponse";
import {
  NOTIF_TEMPLATE_EVENTS,
  NOTIF_TEMPLATE_AUDIENCES,
  NOTIF_TEMPLATE_VARIABLES,
  NOTIF_TEMPLATE_MAX_LENGTH,
} from "@/modules/notif-templates/notifTemplatesService";

const putSchema = z.object({
  event: z.enum(NOTIF_TEMPLATE_EVENTS),
  audience: z.enum(NOTIF_TEMPLATE_AUDIENCES),
  text: z.string().min(1).max(NOTIF_TEMPLATE_MAX_LENGTH),
});

/** `notif_template:*` is PER-ORG (see `orgScopedKeys.ts`) — resolved from the doctor's own clinic membership. */
export async function GET() {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const templates = await deps.notifTemplates.getAllTemplates({ organizationId: gate.ctx.organizationId });
  return NextResponse.json({ ok: true, templates, variables: [...NOTIF_TEMPLATE_VARIABLES] });
}

export async function PUT(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const raw = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { event, audience, text } = parsed.data;
  const deps = buildAppDeps();
  try {
    const template = await deps.notifTemplates.saveTemplate(event, audience, text.trim(), gate.ctx.session.user.userId, {
      organizationId: gate.ctx.organizationId,
    });
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    const errResponse = systemSettingsOrgContextErrorResponse(error);
    if (errResponse) return errResponse;
    throw error;
  }
}
