import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { runWithMechanicWriteClearance } from '@/app-layer/entitlements/mechanicWriteClearance';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import {
  type ClinicDeliveryReadiness,
  withClinicDeliveryReadiness,
} from '@/modules/system-settings/clinicDeliveryReadiness';
import type { SystemSettingKey } from '@/modules/system-settings/types';
import { relayOutbound } from '@/modules/messaging/relayOutbound';
import type { OrgMechanic } from '@/modules/org-entitlements/types';

const bodySchema = z.object({ channel: z.enum(['email', 'telegram', 'max']) });

const SETTING_KEY: Readonly<Record<z.infer<typeof bodySchema>['channel'], SystemSettingKey>> = {
  email: 'clinic_smtp_outbound',
  telegram: 'clinic_telegram_bot_token',
  max: 'clinic_max_bot_api_key',
};

const MECHANIC: Readonly<Record<z.infer<typeof bodySchema>['channel'], OrgMechanic>> = {
  email: 'clinic_smtp',
  telegram: 'clinic_telegram_bot',
  max: 'clinic_max_bot',
};

function employeeRecipient(
  channel: z.infer<typeof bodySchema>['channel'],
  user: {
    email?: string;
    contacts?: Array<{ kind: 'phone' | 'email'; value: string; confirmedAt?: string }>;
    bindings: { telegramId?: string; maxId?: string };
  },
): string | null {
  if (channel === 'telegram') return user.bindings.telegramId?.trim() || null;
  if (channel === 'max') return user.bindings.maxId?.trim() || null;
  const confirmedEmail = user.contacts?.find(
    (contact) => contact.kind === 'email' && contact.confirmedAt && contact.value.trim(),
  )?.value;
  return confirmedEmail?.trim() || user.email?.trim() || null;
}

function failedReadiness(): ClinicDeliveryReadiness {
  return {
    status: 'failed',
    checkedAt: new Date().toISOString(),
    reason: 'Канал не принял проверочное сообщение. Проверьте настройки и повторите отправку.',
  };
}

export async function POST(request: Request) {
  const gate = await requireClinicManagementApiContext({ allowCabinetRecovery: true });
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const { channel } = parsed.data;
  const entitlement = await requireEntitlementForMutation(gate.ctx, MECHANIC[channel]);
  if (!entitlement.ok) return entitlement.response;
  const recipient = employeeRecipient(channel, gate.ctx.session.user);
  if (!recipient) {
    return NextResponse.json(
      {
        ok: false,
        error: 'employee_recipient_missing',
        message:
          channel === 'email'
            ? 'У вашей учётной записи нет адреса почты для проверки.'
            : `У вашей учётной записи не подключён ${channel === 'telegram' ? 'Telegram' : 'MAX'} для проверки.`,
      },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  const key = SETTING_KEY[channel];
  const setting = await deps.systemSettings.getSetting(key, 'admin', {
    organizationId: gate.ctx.organizationId,
  });
  if (!setting) {
    return NextResponse.json(
      { ok: false, error: 'credential_missing', message: 'Сначала сохраните настройки канала.' },
      { status: 409 },
    );
  }

  const result = await relayOutbound(
    {
      messageId: `clinic-channel-test:${randomUUID()}`,
      organizationId: gate.ctx.organizationId,
      channel,
      recipient,
      text: 'Проверка собственного канала клиники. Канал будет включён после успешной доставки этого сообщения.',
      metadata: { subject: 'Проверка канала клиники' },
      clinicCredentialProbe: true,
    },
    { retryDelaysMs: [0] },
  );
  const readiness: ClinicDeliveryReadiness =
    result.ok && result.status === 'accepted'
      ? { status: 'enabled', checkedAt: new Date().toISOString() }
      : failedReadiness();
  const saved = await runWithMechanicWriteClearance(MECHANIC[channel], () =>
    deps.systemSettings.updateSettingIfUnchanged(
      key,
      'admin',
      withClinicDeliveryReadiness(setting.valueJson, readiness),
      gate.ctx.session.user.userId,
      setting.updatedAt,
      { organizationId: gate.ctx.organizationId },
    ),
  );
  if (!saved) {
    return NextResponse.json(
      {
        ok: false,
        error: 'credential_changed',
        message: 'Настройки канала изменились во время проверки. Отправьте проверку ещё раз.',
      },
      { status: 409 },
    );
  }
  if (readiness.status === 'failed') {
    return NextResponse.json(
      { ok: false, error: 'send_failed', message: readiness.reason, readiness },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, readiness });
}
