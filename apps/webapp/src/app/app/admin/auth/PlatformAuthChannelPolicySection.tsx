'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { TriangleAlert } from 'lucide-react';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { LabeledSwitch } from '@/shared/ui/doctor/primitives/labeled-switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/ui/primitives/tooltip';
import type { AuthChannelUiPolicy } from '@/modules/auth/otpChannelUi';
import { OAUTH_PROVIDER_REGISTRY, type OAuthProvider } from '@/modules/auth/oauthProviderRegistry';
import {
  SURFACE_AUTH_CONTROLS,
  patientSurfaceAuthSettingKey,
  type SurfaceAuthControl,
} from '@/modules/auth/surfaceAuthSettings';
import { notificationText } from '@/shared/notifications/notificationText';

type PolicyKey = keyof AuthChannelUiPolicy;
const UNSUPPORTED_CLIENT_FALLBACK_KEY = 'patient_unsupported_client_fallback_enabled' as const;
type ConfigurationStatus = Readonly<{ enabled: boolean; configured: boolean }>;
type ChannelConfigurationStatus = Readonly<Record<PolicyKey, ConfigurationStatus>>;
type OAuthConfigurationStatus = Readonly<Record<OAuthProvider, ConfigurationStatus>>;
type SurfacePolicy = Record<SurfaceAuthControl, boolean>;

const CONTROL_LABELS: ReadonlyArray<{
  control: SurfaceAuthControl;
  label: string;
  hint: string;
}> = [
  { control: 'email', label: 'Email-коды', hint: 'Разрешить вход по одноразовому коду из письма.' },
  { control: 'sms', label: 'SMS-коды', hint: 'Разрешить вход по коду из SMS.' },
  { control: 'telegram', label: 'Telegram', hint: 'Разрешить вход через Telegram.' },
  { control: 'max', label: 'MAX', hint: 'Разрешить вход через MAX.' },
  ...OAUTH_PROVIDER_REGISTRY.map((meta) => ({
    control: `oauth_${meta.provider}` as const,
    label: meta.adminLabel,
    hint: meta.adminHint,
  })),
  {
    control: 'passkey',
    label: 'Ключ доступа (passkey)',
    hint: 'Разрешить вход по ключу доступа.',
  },
];

function emptyPolicy(): SurfacePolicy {
  return Object.fromEntries(
    SURFACE_AUTH_CONTROLS.map((control) => [control, false]),
  ) as SurfacePolicy;
}

const EMPTY_CHANNEL_STATUS: ChannelConfigurationStatus = {
  email: { enabled: false, configured: false },
  sms: { enabled: false, configured: false },
  telegram: { enabled: false, configured: false },
  max: { enabled: false, configured: false },
};
const EMPTY_OAUTH_STATUS = Object.fromEntries(
  OAUTH_PROVIDER_REGISTRY.map((meta) => [meta.provider, { enabled: false, configured: false }]),
) as OAuthConfigurationStatus;

function NotConfiguredHint() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger aria-label="Канал не настроен">
          <TriangleAlert className="size-4 text-destructive" />
        </TooltipTrigger>
        <TooltipContent>Канал не настроен</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Включённый, но ненастроенный канал — это ТИХИЙ отказ, и значок с подсказкой по наведению его не
 * показывает. Владелец 15.09.2026 полчаса ждал код, которого никто не отправлял: переключатель
 * Telegram стоял «включено», а имя бота было пустым, и код молча не уходил (`phone/start` отвечает
 * нейтральным `200` независимо от доставки). Поэтому здесь строка словами, а не иконка.
 */
function NotConfiguredWhileEnabled() {
  return (
    <p className="text-xs text-destructive">
      Включён, но не настроен — вход по этому каналу не работает.
    </p>
  );
}

function readBoolean(valueJson: unknown): boolean {
  if (typeof valueJson === 'boolean') return valueJson;
  if (valueJson && typeof valueJson === 'object' && 'value' in valueJson) {
    return (valueJson as { value?: unknown }).value === true;
  }
  return false;
}

function isConfigured(
  control: SurfaceAuthControl,
  channels: ChannelConfigurationStatus,
  oauth: OAuthConfigurationStatus,
): boolean {
  if (control.startsWith('oauth_')) {
    return oauth[control.slice('oauth_'.length) as OAuthProvider].configured;
  }
  if (control === 'passkey') return true;
  if (control === 'email' || control === 'sms' || control === 'telegram' || control === 'max') {
    return channels[control].configured;
  }
  return false;
}

export function PlatformAuthChannelPolicySection() {
  const [policy, setPolicy] = useState<SurfacePolicy>(emptyPolicy);
  const [channelStatus, setChannelStatus] =
    useState<ChannelConfigurationStatus>(EMPTY_CHANNEL_STATUS);
  const [oauthStatus, setOauthStatus] = useState<OAuthConfigurationStatus>(EMPTY_OAUTH_STATUS);
  const [unsupportedClientFallbackEnabled, setUnsupportedClientFallbackEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/platform/settings', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: Array<{ key?: string; valueJson?: unknown }>;
          channelPolicy?: ChannelConfigurationStatus;
          oauthProviderPolicy?: OAuthConfigurationStatus;
        };
        if (!active || !response.ok || !data.ok || !Array.isArray(data.settings)) {
          throw new Error('settings_unavailable');
        }
        const next = emptyPolicy();
        for (const control of SURFACE_AUTH_CONTROLS) {
          const key = patientSurfaceAuthSettingKey(control);
          next[control] = readBoolean(data.settings.find((item) => item.key === key)?.valueJson);
        }
        setPolicy(next);
        setChannelStatus(data.channelPolicy ?? EMPTY_CHANNEL_STATUS);
        setOauthStatus(data.oauthProviderPolicy ?? EMPTY_OAUTH_STATUS);
        setUnsupportedClientFallbackEnabled(
          readBoolean(
            data.settings.find((item) => item.key === UNSUPPORTED_CLIENT_FALLBACK_KEY)?.valueJson,
          ),
        );
        setLoaded(true);
      })
      .catch(() => {
        if (active) toast.error(notificationText.adminLoginSettingsLoadFailed);
      });
    return () => {
      active = false;
    };
  }, []);

  async function updateSurfaceControl(
    control: SurfaceAuthControl,
    enabled: boolean,
  ): Promise<void> {
    const key = patientSurfaceAuthSettingKey(control);
    const previous = policy[control];
    setPolicy((current) => ({ ...current, [control]: enabled }));
    setSaving(key);
    try {
      const response = await fetch('/api/platform/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, value: enabled }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
      if (!response.ok || !data.ok) throw new Error('save_failed');
    } catch {
      setPolicy((current) => ({ ...current, [control]: previous }));
      toast.error(notificationText.settingsSaveFailed);
    } finally {
      setSaving(null);
    }
  }

  async function updateUnsupportedClientFallback(enabled: boolean): Promise<void> {
    const previous = unsupportedClientFallbackEnabled;
    setUnsupportedClientFallbackEnabled(enabled);
    setSaving(UNSUPPORTED_CLIENT_FALLBACK_KEY);
    try {
      const response = await fetch('/api/platform/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: UNSUPPORTED_CLIENT_FALLBACK_KEY, value: enabled }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
      if (!response.ok || !data.ok) throw new Error('save_failed');
    } catch {
      setUnsupportedClientFallbackEnabled(previous);
      toast.error(notificationText.settingsSaveFailed);
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Доступные способы входа</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
          <div className="text-sm font-medium">Пациенты</div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {CONTROL_LABELS.map(({ control, label, hint }) => {
              const configured = isConfigured(control, channelStatus, oauthStatus);
              return (
                <div key={control} className="flex flex-col gap-1">
                  <div className="flex items-start gap-1.5">
                    <LabeledSwitch
                      label={label}
                      hint={hint}
                      checked={policy[control]}
                      disabled={!loaded || saving !== null || (!policy[control] && !configured)}
                      onCheckedChange={(enabled) => void updateSurfaceControl(control, enabled)}
                    />
                    {!configured ? <NotConfiguredHint /> : null}
                  </div>
                  {loaded && policy[control] && !configured ? <NotConfiguredWhileEnabled /> : null}
                </div>
              );
            })}
          </div>
        </div>
      </DoctorSection>
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Совместимость устройств</DoctorSectionTitle>
        </DoctorSectionHeader>
        <LabeledSwitch
          label="Помощь при сбое запуска"
          hint="Показывать страницу помощи и принимать обезличенный технический сигнал, если приложение не запустилось."
          checked={unsupportedClientFallbackEnabled}
          disabled={!loaded || saving !== null}
          onCheckedChange={(enabled) => void updateUnsupportedClientFallback(enabled)}
        />
      </DoctorSection>
    </>
  );
}
