/**
 * GET  /api/admin/notification-templates — все шаблоны уведомлений (event×audience) + список переменных
 * PUT  /api/admin/notification-templates — сохранить один шаблон (event, audience, text)
 * Guard: requireAdminModeSession (role=admin)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
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

export async function GET() {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const templates = await deps.notifTemplates.getAllTemplates();
  return NextResponse.json({ ok: true, templates, variables: [...NOTIF_TEMPLATE_VARIABLES] });
}

export async function PUT(request: Request) {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const raw = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { event, audience, text } = parsed.data;
  const deps = buildAppDeps();
  const template = await deps.notifTemplates.saveTemplate(event, audience, text.trim(), gate.session.user.userId);
  return NextResponse.json({ ok: true, template });
}
