'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  entitlementMutationRefusalMessage,
  requireEntitlementForMutationAction,
} from '@/app-layer/guards/requireEntitlement';
import { requireDoctorAccess, requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import type {
  BroadcastAuditEntry,
  BroadcastCommand,
  BroadcastPreviewResult,
} from '@/modules/doctor-broadcasts/ports';
import type { BroadcastChannelCounts, BroadcastDraft } from '@/modules/doctor-broadcasts/draftPort';
import { normalizeBroadcastChannels } from '@/modules/doctor-broadcasts/broadcastChannels';

/**
 * Zod-схема для входящего черновика рассылки.
 * Server Actions сериализуют/десериализуют аргументы, поэтому проверяем
 * допустимые значения и длины на границе — прежде чем передавать в репозиторий.
 */
const draftSchema = z.object({
  category: z
    .enum([
      'service',
      'organizational',
      'marketing',
      'important_notice',
      'schedule_change',
      'reminder',
      'education',
      'survey',
    ])
    .nullable(),
  audience: z
    .enum([
      'all',
      'active_clients',
      'with_upcoming_appointment',
      'without_appointment',
      'with_telegram',
      'with_max',
      'sms_only',
      'inactive',
    ])
    .nullable(),
  channels: z
    .array(
      z.enum([
        'bot_message',
        'sms',
        'push',
        'telegram',
        'max',
        'email',
        'home_banner',
        'notification_bell',
      ]),
    )
    .max(10),
  title: z.string().max(200),
  body: z.string().max(4000),
  // RASSL-06 phase 1: опц. прикреплённая картинка (round-trip черновика).
  mediaUrl: z.string().url().nullable().optional(),
  mediaType: z.string().nullable().optional(),
});

export async function previewBroadcastAction(
  command: Omit<BroadcastCommand, 'actorId'>,
): Promise<BroadcastPreviewResult> {
  const workspace = await requireDoctorWorkspaceContext();
  const deps = buildAppDeps();
  return deps.doctorBroadcasts.preview(
    { ...command, actorId: workspace.session.user.userId },
    { organizationId: workspace.organizationId, visibilityActor: workspace },
  );
}

export async function executeBroadcastAction(
  command: Omit<BroadcastCommand, 'actorId'>,
): Promise<{ auditEntry: BroadcastAuditEntry }> {
  const workspace = await requireDoctorWorkspaceContext();
  const entitlement = await requireEntitlementForMutationAction(workspace, 'mailings');
  if (!entitlement.ok) {
    throw new Error(entitlementMutationRefusalMessage('отправить рассылку', entitlement.reason));
  }
  await assertClinicBroadcastChannels(workspace, command.channels);
  const deps = buildAppDeps();
  const result = await deps.doctorBroadcasts.execute(
    {
      ...command,
      actorId: workspace.session.user.userId,
    },
    {
      organizationId: workspace.organizationId,
      visibilityActor: workspace,
      runDeliveryCommit: (fn) =>
        withDoctorWorkspacePrincipal(workspace, 'doctor.broadcasts.execute', fn),
    },
  );
  revalidatePath('/app/doctor/broadcasts');
  return result;
}

async function assertClinicBroadcastChannels(
  workspace: Awaited<ReturnType<typeof requireDoctorWorkspaceContext>>,
  requestedChannels: string[] | undefined,
): Promise<void> {
  const channels = normalizeBroadcastChannels(requestedChannels);
  const required = new Map<
    string,
    {
      mechanic: 'clinic_smtp' | 'clinic_sms' | 'clinic_telegram_bot' | 'clinic_max_bot';
      settingKey:
        | 'clinic_smtp_outbound'
        | 'clinic_smsc_api_key'
        | 'clinic_telegram_bot_token'
        | 'clinic_max_bot_api_key';
    }
  >();
  if (channels.includes('email'))
    required.set('email', { mechanic: 'clinic_smtp', settingKey: 'clinic_smtp_outbound' });
  if (channels.includes('sms'))
    required.set('sms', { mechanic: 'clinic_sms', settingKey: 'clinic_smsc_api_key' });
  if (channels.includes('telegram'))
    required.set('telegram', {
      mechanic: 'clinic_telegram_bot',
      settingKey: 'clinic_telegram_bot_token',
    });
  if (channels.includes('max'))
    required.set('max', { mechanic: 'clinic_max_bot', settingKey: 'clinic_max_bot_api_key' });
  if (required.size === 0) throw new Error('clinic_delivery_channel_required');

  const deps = buildAppDeps();
  for (const { mechanic, settingKey } of required.values()) {
    const entitlement = await requireEntitlementForMutationAction(workspace, mechanic);
    if (!entitlement.ok) throw new Error(`${entitlement.reason}:${entitlement.mechanic}`);
    const setting = await deps.systemSettings.getSetting(settingKey, 'admin', {
      organizationId: workspace.organizationId,
    });
    if (setting?.organizationId !== workspace.organizationId) {
      throw new Error(`clinic_delivery_channel_not_configured:${settingKey}`);
    }
    const value = setting?.valueJson;
    const inner =
      value && typeof value === 'object' && 'value' in value
        ? (value as { value: unknown }).value
        : null;
    if (typeof inner === 'string' ? inner.trim().length === 0 : inner === null) {
      throw new Error(`clinic_delivery_channel_not_configured:${settingKey}`);
    }
  }
}

export async function listBroadcastAuditAction(limit?: number): Promise<BroadcastAuditEntry[]> {
  const workspace = await requireDoctorWorkspaceContext();
  const deps = buildAppDeps();
  return deps.doctorBroadcasts.listAudit(
    {
      organizationId: workspace.organizationId,
      actorUserId: workspace.session.user.userId,
      visibilityActor: workspace,
    },
    limit,
  );
}

export async function loadDraftAction(): Promise<BroadcastDraft | null> {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  return deps.doctorBroadcastComposer.loadDraft(session.user.userId);
}

export async function saveDraftAction(draft: BroadcastDraft): Promise<void> {
  const workspace = await requireDoctorWorkspaceContext();
  const entitlement = await requireEntitlementForMutationAction(workspace, 'mailings');
  if (!entitlement.ok) {
    throw new Error(entitlementMutationRefusalMessage('сохранить черновик рассылки', entitlement.reason));
  }
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) {
    throw new Error('draft_validation_error');
  }
  const deps = buildAppDeps();
  await withDoctorWorkspacePrincipal(workspace, 'doctor.broadcasts.draft.save', () =>
    deps.doctorBroadcastComposer.saveDraft(
      workspace.session.user.userId,
      parsed.data as BroadcastDraft,
    ),
  );
}

export async function getChannelCountsAction(): Promise<BroadcastChannelCounts> {
  const workspace = await requireDoctorWorkspaceContext();
  const deps = buildAppDeps();
  return deps.doctorBroadcastComposer.getChannelCounts({
    organizationId: workspace.organizationId,
    visibilityActor: workspace,
  });
}

const audienceFilterSchema = z.enum([
  'all',
  'active_clients',
  'with_upcoming_appointment',
  'without_appointment',
  'with_telegram',
  'with_max',
  'sms_only',
  'inactive',
]);

export async function getChannelCountsByAudienceAction(
  audience: string,
): Promise<BroadcastChannelCounts> {
  const workspace = await requireDoctorWorkspaceContext();
  const parsed = audienceFilterSchema.safeParse(audience);
  if (!parsed.success) throw new Error('invalid_audience_filter');
  const deps = buildAppDeps();
  return deps.doctorBroadcastComposer.getChannelCountsByAudience(parsed.data, {
    organizationId: workspace.organizationId,
    visibilityActor: workspace,
  });
}
