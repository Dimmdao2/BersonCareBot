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

type PolicyKey = keyof AuthChannelUiPolicy;
type SettingKey = `auth_${PolicyKey}_enabled`;
type OAuthProviderKey = 'google' | 'yandex' | 'apple';
type OAuthSettingKey = `auth_oauth_${OAuthProviderKey}_enabled`;
type IndependentMethodKey = 'passkey';
type IndependentSettingKey = `auth_${IndependentMethodKey}_enabled`;
const UNSUPPORTED_CLIENT_FALLBACK_KEY = 'patient_unsupported_client_fallback_enabled' as const;
type SavingKey =
  | PolicyKey
  | OAuthProviderKey
  | IndependentMethodKey
  | typeof UNSUPPORTED_CLIENT_FALLBACK_KEY;

type ConfigurationStatus = Readonly<{ enabled: boolean; configured: boolean }>;
type ChannelConfigurationStatus = Readonly<Record<PolicyKey, ConfigurationStatus>>;
type OAuthConfigurationStatus = Readonly<Record<OAuthProviderKey, ConfigurationStatus>>;

const CHANNELS: ReadonlyArray<{ channel: PolicyKey; label: string; hint: string }> = [
  {
    channel: 'email',
    label: 'Email-коды',
    hint: 'Разрешить вход и регистрацию по одноразовому коду из письма.',
  },
  {
    channel: 'sms',
    label: 'SMS-коды',
    hint: 'Разрешить подтверждение номера и одноразовые коды по SMS.',
  },
  { channel: 'telegram', label: 'Telegram', hint: 'Разрешить вход и привязку через Telegram.' },
  { channel: 'max', label: 'MAX', hint: 'Разрешить вход и привязку через MAX.' },
];

const OAUTH_PROVIDERS: ReadonlyArray<{ provider: OAuthProviderKey; label: string; hint: string }> =
  [
    { provider: 'google', label: 'Google', hint: 'Разрешить вход через Google OAuth.' },
    { provider: 'yandex', label: 'Яндекс', hint: 'Разрешить вход через Яндекс OAuth.' },
    {
      provider: 'apple',
      label: 'Apple',
      hint: 'Разрешить Sign in with Apple при настроенных параметрах.',
    },
  ];

const INDEPENDENT_METHODS: ReadonlyArray<{
  method: IndependentMethodKey;
  label: string;
  hint: string;
}> = [
  {
    method: 'passkey',
    label: 'Ключ доступа (passkey)',
    hint: 'Разрешить добровольное добавление ключей доступа и вход по ним.',
  },
];

const EMPTY_POLICY: AuthChannelUiPolicy = { email: false, sms: false, telegram: false, max: false };
const EMPTY_CHANNEL_STATUS: ChannelConfigurationStatus = {
  email: { enabled: false, configured: false },
  sms: { enabled: false, configured: false },
  telegram: { enabled: false, configured: false },
  max: { enabled: false, configured: false },
};
const EMPTY_OAUTH_POLICY: Record<OAuthProviderKey, boolean> = {
  google: false,
  yandex: false,
  apple: false,
};
const EMPTY_OAUTH_STATUS: OAuthConfigurationStatus = {
  google: { enabled: false, configured: false },
  yandex: { enabled: false, configured: false },
  apple: { enabled: false, configured: false },
};
const EMPTY_INDEPENDENT_POLICY: Record<IndependentMethodKey, boolean> = {
  passkey: false,
};

/**
 * Owner ruling 2026-07-31 (`IDENTITY_AND_MERGE_SCHEME.md` §4): пока канал не настроен, включить
 * его нельзя — флажок недоступен, рядом иконка с подсказкой «канал не настроен».
 */
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

export function PlatformAuthChannelPolicySection() {
  const [policy, setPolicy] = useState<AuthChannelUiPolicy>(EMPTY_POLICY);
  const [channelStatus, setChannelStatus] =
    useState<ChannelConfigurationStatus>(EMPTY_CHANNEL_STATUS);
  const [oauthPolicy, setOauthPolicy] =
    useState<Record<OAuthProviderKey, boolean>>(EMPTY_OAUTH_POLICY);
  const [oauthStatus, setOauthStatus] = useState<OAuthConfigurationStatus>(EMPTY_OAUTH_STATUS);
  const [independentPolicy, setIndependentPolicy] =
    useState<Record<IndependentMethodKey, boolean>>(EMPTY_INDEPENDENT_POLICY);
  const [unsupportedClientFallbackEnabled, setUnsupportedClientFallbackEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<SavingKey | null>(null);

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
        const next = { ...EMPTY_POLICY };
        for (const channel of CHANNELS) {
          const setting = data.settings.find(
            (item) => item.key === `auth_${channel.channel}_enabled`,
          );
          next[channel.channel] = readBoolean(setting?.valueJson);
        }
        setPolicy(next);
        setChannelStatus(data.channelPolicy ?? EMPTY_CHANNEL_STATUS);

        const nextOauth = { ...EMPTY_OAUTH_POLICY };
        for (const { provider } of OAUTH_PROVIDERS) {
          const setting = data.settings.find(
            (item) => item.key === `auth_oauth_${provider}_enabled`,
          );
          nextOauth[provider] = readBoolean(setting?.valueJson);
        }
        setOauthPolicy(nextOauth);
        setOauthStatus(data.oauthProviderPolicy ?? EMPTY_OAUTH_STATUS);

        const nextIndependent = { ...EMPTY_INDEPENDENT_POLICY };
        for (const { method } of INDEPENDENT_METHODS) {
          const setting = data.settings.find((item) => item.key === `auth_${method}_enabled`);
          nextIndependent[method] = readBoolean(setting?.valueJson);
        }
        setIndependentPolicy(nextIndependent);

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

  async function updateChannel(channel: PolicyKey, enabled: boolean): Promise<void> {
    const previous = policy[channel];
    setPolicy((current) => ({ ...current, [channel]: enabled }));
    setSaving(channel);
    try {
      const key: SettingKey = `auth_${channel}_enabled`;
      const response = await fetch('/api/platform/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, value: enabled }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
      if (!response.ok || !data.ok) throw new Error('save_failed');
    } catch {
      setPolicy((current) => ({ ...current, [channel]: previous }));
      toast.error('Не удалось сохранить настройку');
    } finally {
      setSaving(null);
    }
  }

  async function updateOAuthProvider(provider: OAuthProviderKey, enabled: boolean): Promise<void> {
    const previous = oauthPolicy[provider];
    setOauthPolicy((current) => ({ ...current, [provider]: enabled }));
    setSaving(provider);
    try {
      const key: OAuthSettingKey = `auth_oauth_${provider}_enabled`;
      const response = await fetch('/api/platform/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, value: enabled }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
      if (!response.ok || !data.ok) throw new Error('save_failed');
    } catch {
      setOauthPolicy((current) => ({ ...current, [provider]: previous }));
      toast.error('Не удалось сохранить настройку');
    } finally {
      setSaving(null);
    }
  }

  async function updateIndependentMethod(
    method: IndependentMethodKey,
    enabled: boolean,
  ): Promise<void> {
    const previous = independentPolicy[method];
    setIndependentPolicy((current) => ({ ...current, [method]: enabled }));
    setSaving(method);
    try {
      const key: IndependentSettingKey = `auth_${method}_enabled`;
      const response = await fetch('/api/platform/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, value: enabled }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
      if (!response.ok || !data.ok) throw new Error('save_failed');
    } catch {
      setIndependentPolicy((current) => ({ ...current, [method]: previous }));
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
        <div className="grid gap-4 md:grid-cols-2">
          {CHANNELS.map(({ channel, label, hint }) => (
            <div key={channel} className="flex items-start gap-1.5">
              <LabeledSwitch
                label={label}
                hint={hint}
                checked={policy[channel]}
                disabled={
                  !loaded || saving !== null || (!policy[channel] && !channelStatus[channel].configured)
                }
                onCheckedChange={(enabled) => void updateChannel(channel, enabled)}
              />
              {!channelStatus[channel].configured ? <NotConfiguredHint /> : null}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Парольный вход по email остаётся доступен независимо от переключателя email-кодов.
        </p>
      </DoctorSection>
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Вход через OAuth</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="grid gap-4 md:grid-cols-2">
          {OAUTH_PROVIDERS.map(({ provider, label, hint }) => (
            <div key={provider} className="flex items-start gap-1.5">
              <LabeledSwitch
                label={label}
                hint={hint}
                checked={oauthPolicy[provider]}
                disabled={
                  !loaded ||
                  saving !== null ||
                  (!oauthPolicy[provider] && !oauthStatus[provider].configured)
                }
                onCheckedChange={(enabled) => void updateOAuthProvider(provider, enabled)}
              />
              {!oauthStatus[provider].configured ? <NotConfiguredHint /> : null}
            </div>
          ))}
        </div>
      </DoctorSection>
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Другие способы входа</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="grid gap-4 md:grid-cols-2">
          {INDEPENDENT_METHODS.map(({ method, label, hint }) => (
            <LabeledSwitch
              key={method}
              label={label}
              hint={hint}
              checked={independentPolicy[method]}
              disabled={!loaded || saving !== null}
              onCheckedChange={(enabled) => void updateIndependentMethod(method, enabled)}
            />
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
