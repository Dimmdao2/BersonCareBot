'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import type { ActionFailureFields } from '@/shared/http/apiResponse';
import { ActionFailureText } from '@/shared/ui/doctor/ActionFailureText';
import { OrgBrandLogoControl, type OrgBrandLogoChange } from './OrgBrandLogoControl';
import { SecretSettingInput } from './SecretSettingInput';
import { saveOrgBranding } from './brandingActions';
import { apiJson } from '@/shared/lib/apiJson';
import type { ClinicDeliveryReadiness } from '@/modules/system-settings/clinicDeliveryReadiness';
import type { ClinicBotPublicConfig } from '@/modules/system-settings/clinicBotConfig';
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_NAME_TOO_LONG_CODE,
  ORGANIZATION_NAME_TOO_LONG_MESSAGE,
} from '@/shared/lib/organizationName';

type Props = {
  brandingMutationAvailable: boolean;
  /** Canonical organization name — never gated by the paid mechanic, always defined (§3.4). */
  coreDisplayName: string;
  /** A first publication is still a mutation when it keeps the canonical name and has no logo. */
  hasPublishedRevision: boolean;
  /** Currently published paid name override, or `null` when none is set (uses the core name). */
  publishedDisplayName: string | null;
  publishedLogoMediaId: string | null;
  publishedLogoUrl: string | null;
  /** Опубликованная иконка приложения и её URL предпросмотра; `null` — иконка не поставлена. */
  publishedAppIconMediaId: string | null;
  publishedAppIconUrl: string | null;
  clinicBots?: {
    telegram: ClinicBotSettings;
    max: ClinicBotSettings;
  };
};

type ClinicBotSettings = {
  available: boolean;
  configured: boolean;
  readiness: ClinicDeliveryReadiness;
  publicConfig: ClinicBotPublicConfig;
  webhookPath: string | null;
};

const SAVE_ERROR_MESSAGES: Record<string, string> = {
  entitlement_disabled: 'Брендирование недоступно на текущем тарифе.',
  commercial_read_only: 'Брендирование доступно только для просмотра.',
  app_icon_source_unavailable: 'Файл иконки недоступен. Загрузите картинку заново.',
  app_icon_encode_failed: 'Не удалось подготовить размеры иконки. Нужна картинка PNG или JPEG.',
  app_icon_store_failed: 'Не удалось сохранить размеры иконки. Попробуйте ещё раз.',
  [ORGANIZATION_NAME_TOO_LONG_CODE]: ORGANIZATION_NAME_TOO_LONG_MESSAGE,
};

async function saveBotSetting(
  key: 'clinic_telegram_bot_token' | 'clinic_max_bot_api_key',
  config: ClinicBotPublicConfig,
): Promise<void> {
  await apiJson('/api/admin/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      value: {
        value: '',
        botPublicId: config.botPublicId ?? '',
        inboundForwarding: config.inboundForwarding ?? { enabled: false, destinationChatId: '' },
      },
    }),
  });
}

function ClinicBotControls({
  channel,
  settings,
}: Readonly<{
  channel: 'telegram' | 'max';
  settings: ClinicBotSettings;
}>) {
  const settingKey =
    channel === 'telegram' ? 'clinic_telegram_bot_token' : 'clinic_max_bot_api_key';
  const [configured, setConfigured] = useState(settings.configured);
  const [readiness, setReadiness] = useState(settings.readiness);
  const [botPublicId, setBotPublicId] = useState(settings.publicConfig.botPublicId ?? '');
  const [forwardingEnabled, setForwardingEnabled] = useState(
    settings.publicConfig.inboundForwarding?.enabled === true,
  );
  const [destinationChatId, setDestinationChatId] = useState(
    settings.publicConfig.inboundForwarding?.destinationChatId ?? '',
  );
  const [probePending, setProbePending] = useState(false);
  const [pending, startTransition] = useTransition();
  const title = channel === 'telegram' ? 'Telegram-бот' : 'MAX-бот';
  const handleLabel =
    channel === 'telegram' ? 'Публичный @username бота' : 'Публичный ник бота MAX';

  const testChannel = () => {
    setProbePending(true);
    startTransition(async () => {
      try {
        const result = await apiJson<{ ok: true; readiness: ClinicDeliveryReadiness }>(
          '/api/admin/clinic-delivery-test',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel }),
          },
        );
        setReadiness(result.readiness);
      } catch (cause) {
        const reason =
          cause instanceof Error && cause.message.trim()
            ? cause.message
            : 'Канал не принял проверочное сообщение.';
        setReadiness({ status: 'failed', checkedAt: new Date().toISOString(), reason });
      } finally {
        setProbePending(false);
      }
    });
  };

  const readinessText =
    readiness.status === 'enabled'
      ? 'Канал включён'
      : readiness.status === 'failed'
        ? `Проверка не прошла: ${readiness.reason}`
        : 'Ждём проверочной отправки';

  return (
    <section className="flex flex-col gap-2">
      <SecretSettingInput
        title={title}
        description={`Credential собственного ${title} организации.`}
        settingKey={settingKey}
        configured={configured}
        configuredLabel="Настройки сохранены"
        saveSetting={async (key, value) => {
          await apiJson('/api/admin/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value: { value } }),
          });
        }}
        webhookPath={settings.webhookPath}
        onSaved={() => {
          setConfigured(true);
          setReadiness({ status: 'pending' });
        }}
      />
      <div className="flex flex-col items-start gap-2">
        <p
          className={
            readiness.status === 'failed'
              ? 'text-xs text-destructive'
              : 'text-xs text-muted-foreground'
          }
        >
          {readinessText}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!configured || probePending}
          onClick={testChannel}
        >
          {probePending ? 'Отправляем…' : 'Отправить проверку себе'}
        </Button>
      </div>
      {configured ? (
        <div className="flex flex-col gap-2">
          <Input
            value={botPublicId}
            onChange={(event) => setBotPublicId(event.target.value)}
            placeholder={handleLabel}
            spellCheck={false}
            disabled={pending}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={forwardingEnabled}
              disabled={pending}
              onChange={(event) => setForwardingEnabled(event.target.checked)}
            />
            Пересылать входящие сообщения
          </label>
          <Input
            value={destinationChatId}
            onChange={(event) => setDestinationChatId(event.target.value)}
            placeholder="Id чата, куда пересылать"
            inputMode="numeric"
            spellCheck={false}
            disabled={pending}
          />
          <Button
            type="button"
            size="sm"
            className="w-fit"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await saveBotSetting(settingKey, {
                    botPublicId: botPublicId.trim() ? botPublicId.trim() : null,
                    inboundForwarding: {
                      enabled: forwardingEnabled,
                      destinationChatId: destinationChatId.trim(),
                    },
                  });
                  toast.success('Настройки бота сохранены');
                } catch (cause) {
                  toast.error(
                    cause instanceof Error && cause.message.trim()
                      ? cause.message
                      : 'Не удалось сохранить настройки бота.',
                  );
                }
              })
            }
          >
            Сохранить настройки бота
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * UX-05 B2 — the clinic brand editing surface (settings "Клиника" tab). Owner-specified fields
 * only: clinic name + logo («Установить» / «Очистить») + one "Сохранить" action
 * (BRANDING_DOMAIN_CONTRACT.md "Owner decisions on the brand editing UI", 2026-07-25). No draft/
 * publish concept is exposed — see `brandingActions.ts`.
 */
export function OrgBrandingSection({
  brandingMutationAvailable,
  coreDisplayName,
  hasPublishedRevision,
  publishedDisplayName,
  publishedLogoMediaId,
  publishedLogoUrl,
  publishedAppIconMediaId,
  publishedAppIconUrl,
  clinicBots,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(publishedDisplayName ?? coreDisplayName);
  const [logoMediaId, setLogoMediaId] = useState<string | null>(publishedLogoMediaId);
  const [appIconMediaId, setAppIconMediaId] = useState<string | null>(publishedAppIconMediaId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ActionFailureFields | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const baselineName = (publishedDisplayName ?? coreDisplayName).trim();
  const dirty =
    !hasPublishedRevision ||
    name.trim() !== baselineName ||
    logoMediaId !== publishedLogoMediaId ||
    appIconMediaId !== publishedAppIconMediaId;

  function handleLogoChange(next: OrgBrandLogoChange) {
    setLogoMediaId(next?.mediaId ?? null);
    setJustSaved(false);
  }

  function handleAppIconChange(next: OrgBrandLogoChange) {
    setAppIconMediaId(next?.mediaId ?? null);
    setJustSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const trimmedName = name.trim();
      // No override recorded when the field matches the canonical core name — keeps a
      // straightforward "cleared back to platform default" state instead of an inert duplicate.
      const displayName =
        trimmedName === '' || trimmedName === coreDisplayName.trim() ? null : trimmedName;
      const result = await saveOrgBranding({ displayName, logoMediaId, appIconMediaId });
      if (!result.ok) {
        // The known codes keep their own sentence; the support reference travels with whatever the
        // door could not name, so an unmapped save failure is still traceable from this screen.
        setError({
          ...result,
          error: SAVE_ERROR_MESSAGES[result.error] ?? 'Не удалось сохранить.',
        });
        return;
      }
      setJustSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Бренд организации</DoctorSectionTitle>
      </DoctorSectionHeader>

      {!brandingMutationAvailable ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-muted-foreground">
          Брендирование доступно только для просмотра. Сохранённые название и логотип остаются
          применёнными, но изменения недоступны.
        </p>
      ) : null}

      <div className="flex max-w-md flex-col gap-4">
        <DoctorField label="Название организации" htmlFor="org-brand-name">
          <Input
            id="org-brand-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setJustSaved(false);
            }}
            disabled={!brandingMutationAvailable || saving}
            maxLength={ORGANIZATION_NAME_MAX_LENGTH}
          />
        </DoctorField>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Логотип</span>
          <OrgBrandLogoControl
            initialMediaId={publishedLogoMediaId}
            initialUrl={publishedLogoUrl}
            disabled={!brandingMutationAvailable || saving}
            onChange={handleLogoChange}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Иконка приложения</span>
          <p className="text-xs text-muted-foreground">
            Квадратная картинка: она встаёт на иконку установленного приложения пациента и на
            фавикон сайта. Нужные размеры готовятся сразу при сохранении.
          </p>
          <OrgBrandLogoControl
            initialMediaId={publishedAppIconMediaId}
            initialUrl={publishedAppIconUrl}
            disabled={!brandingMutationAvailable || saving}
            onChange={handleAppIconChange}
            emptyLabel="Нет иконки"
            pickerTitle="Иконка приложения"
            instanceKey="org-brand-app-icon"
          />
        </div>

        <ActionFailureText failure={error} />
        {justSaved && !dirty ? <p className="text-sm text-muted-foreground">Сохранено.</p> : null}

        <div>
          <Button
            type="button"
            size="sm"
            disabled={!brandingMutationAvailable || saving || !dirty}
            onClick={() => void handleSave()}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>

        {clinicBots?.telegram.available ? (
          <ClinicBotControls channel="telegram" settings={clinicBots.telegram} />
        ) : null}
        {clinicBots?.max.available ? (
          <ClinicBotControls channel="max" settings={clinicBots.max} />
        ) : null}
      </div>
    </DoctorSection>
  );
}
