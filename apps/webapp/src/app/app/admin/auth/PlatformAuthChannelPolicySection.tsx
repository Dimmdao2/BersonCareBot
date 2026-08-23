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
  SURFACE_AUTH_POLICY_NAMES,
  surfaceAuthSettingKey,
  type SurfaceAuthControl,
} from '@/modules/auth/surfaceAuthSettings';
import type { SurfaceAuthPolicyName } from '@/shared/lib/surface/requestSurface';

type PolicyKey = keyof AuthChannelUiPolicy;
const UNSUPPORTED_CLIENT_FALLBACK_KEY = 'patient_unsupported_client_fallback_enabled' as const;
type ConfigurationStatus = Readonly<{ enabled: boolean; configured: boolean }>;
type ChannelConfigurationStatus = Readonly<Record<PolicyKey, ConfigurationStatus>>;
type OAuthConfigurationStatus = Readonly<Record<OAuthProvider, ConfigurationStatus>>;
type SurfacePolicy = Record<SurfaceAuthControl, boolean>;
type SurfacePolicies = Record<SurfaceAuthPolicyName, SurfacePolicy>;

const SURFACE_LABELS: Readonly<Record<SurfaceAuthPolicyName, string>> = {
  staff: 'Персонал клиник',
  platform_admin: 'Админ платформы',
  patient: 'Пациенты',
};

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

function emptyPolicies(): SurfacePolicies {
  return Object.fromEntries(
    SURFACE_AUTH_POLICY_NAMES.map((surface) => [
      surface,
      Object.fromEntries(SURFACE_AUTH_CONTROLS.map((control) => [control, false])),
    ]),
  ) as SurfacePolicies;
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
  const [policies, setPolicies] = useState<SurfacePolicies>(emptyPolicies);
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
        const next = emptyPolicies();
        for (const surface of SURFACE_AUTH_POLICY_NAMES) {
          for (const control of SURFACE_AUTH_CONTROLS) {
            const key = surfaceAuthSettingKey(surface, control);
            next[surface][control] = readBoolean(
              data.settings.find((item) => item.key === key)?.valueJson,
            );
          }
        }
        setPolicies(next);
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
        if (active) toast.error('Не удалось загрузить настройки способов входа');
      });
    return () => {
      active = false;
    };
  }, []);

  async function updateSurfaceControl(
    surface: SurfaceAuthPolicyName,
    control: SurfaceAuthControl,
    enabled: boolean,
  ): Promise<void> {
    const key = surfaceAuthSettingKey(surface, control);
    const previous = policies[surface][control];
    setPolicies((current) => ({
      ...current,
      [surface]: { ...current[surface], [control]: enabled },
    }));
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
      setPolicies((current) => ({
        ...current,
        [surface]: { ...current[surface], [control]: previous },
      }));
      toast.error('Не удалось сохранить настройку');
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
      toast.error('Не удалось сохранить настройку');
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
        <div className="divide-y divide-border">
          {SURFACE_AUTH_POLICY_NAMES.map((surface) => (
            <div
              key={surface}
              className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[180px_1fr]"
            >
              <div className="text-sm font-medium">{SURFACE_LABELS[surface]}</div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {CONTROL_LABELS.map(({ control, label, hint }) => {
                  const configured = isConfigured(control, channelStatus, oauthStatus);
                  return (
                    <div key={control} className="flex items-start gap-1.5">
                      <LabeledSwitch
                        label={label}
                        hint={hint}
                        checked={policies[surface][control]}
                        disabled={
                          !loaded || saving !== null || (!policies[surface][control] && !configured)
                        }
                        onCheckedChange={(enabled) =>
                          void updateSurfaceControl(surface, control, enabled)
                        }
                      />
                      {!configured ? <NotConfiguredHint /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
