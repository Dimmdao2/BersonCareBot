import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import {
  NOTIF_TEMPLATE_AUDIENCES,
  NOTIF_TEMPLATE_EVENTS,
  NotifTemplateConflictError,
} from '@/modules/notif-templates/notifTemplatesService';
import {
  NOTIF_TEMPLATE_CHANNELS,
  SYNTHETIC_NOTIF_TEMPLATE_VARIABLES,
  ManagedNotifTemplateValidationError,
  renderManagedNotifTemplate,
} from '@/modules/notif-templates/managedNotifTemplate';

const channelsSchema = z
  .object({
    email: z.object({ subject: z.string(), plainText: z.string() }).strict(),
    telegram: z.object({ text: z.string() }).strict(),
    max: z.object({ text: z.string() }).strict(),
    smsc: z.object({ text: z.string() }).strict(),
    web_push: z.object({ title: z.string(), text: z.string() }).strict(),
  })
  .strict();

const presentationSchema = z
  .object({
    layout: z.enum(['neutral', 'organization']),
    signature: z.string().max(500),
    contacts: z.string().max(500),
  })
  .strict();

const templateWriteSchema = z
  .object({
    kind: z.literal('template'),
    event: z.enum(NOTIF_TEMPLATE_EVENTS),
    audience: z.enum(NOTIF_TEMPLATE_AUDIENCES),
    channels: channelsSchema,
    expectedUpdatedAt: z.string().min(1).nullable(),
  })
  .strict();

const presentationWriteSchema = z
  .object({
    kind: z.literal('presentation'),
    presentation: presentationSchema,
    expectedUpdatedAt: z.string().min(1).nullable(),
  })
  .strict();

const putSchema = z.discriminatedUnion('kind', [templateWriteSchema, presentationWriteSchema]);
const previewSchema = z
  .object({
    event: z.enum(NOTIF_TEMPLATE_EVENTS),
    audience: z.enum(NOTIF_TEMPLATE_AUDIENCES),
    channel: z.enum(NOTIF_TEMPLATE_CHANNELS),
    channels: channelsSchema,
    presentation: presentationSchema,
  })
  .strict();

function invalidTemplateResponse() {
  return NextResponse.json({ ok: false, error: 'invalid_template' }, { status: 400 });
}

function isInvalidTemplateError(error: unknown): boolean {
  return (
    error instanceof ManagedNotifTemplateValidationError ||
    (error instanceof Error && error.message === 'invalid_notification_presentation')
  );
}

/** Platform-owned `organization_id IS NULL` defaults; no clinic membership is borrowed. */
export async function GET() {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  const [templates, presentation] = await Promise.all([
    deps.notifTemplates.getManagedTemplates({ organizationId: null }),
    deps.notifTemplates.getManagedPresentation({ organizationId: null }),
  ]);
  return NextResponse.json({
    ok: true,
    templates,
    presentation,
    brandingMutationAvailable: true,
  });
}

export async function PUT(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  const deps = buildAppDeps();
  try {
    if (parsed.data.kind === 'presentation') {
      const presentation = await deps.notifTemplates.saveManagedPresentation(
        parsed.data.presentation,
        gate.session.user.userId,
        parsed.data.expectedUpdatedAt,
        { organizationId: null },
      );
      return NextResponse.json({ ok: true, presentation });
    }
    const template = await deps.notifTemplates.saveManagedTemplate(
      parsed.data.event,
      parsed.data.audience,
      parsed.data.channels,
      gate.session.user.userId,
      parsed.data.expectedUpdatedAt,
      { organizationId: null },
    );
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    if (error instanceof NotifTemplateConflictError) {
      return NextResponse.json({ ok: false, error: 'template_conflict' }, { status: 409 });
    }
    if (isInvalidTemplateError(error)) return invalidTemplateResponse();
    throw error;
  }
}

/** Synthetic server rendering only. This route never resolves a recipient or calls a sender. */
export async function POST(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;
  const parsed = previewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  try {
    const rendered = renderManagedNotifTemplate({
      event: parsed.data.event,
      audience: parsed.data.audience,
      channel: parsed.data.channel,
      template: { version: 1, revision: 0, channels: parsed.data.channels },
      presentation: {
        version: 1,
        revision: 0,
        ...parsed.data.presentation,
        logoAssetId: null,
        avatarAssetId: null,
      },
      variables: SYNTHETIC_NOTIF_TEMPLATE_VARIABLES,
      brandingEnabled: parsed.data.presentation.layout === 'organization',
    });
    return NextResponse.json({ ok: true, rendered });
  } catch (error) {
    if (isInvalidTemplateError(error)) return invalidTemplateResponse();
    throw error;
  }
}
