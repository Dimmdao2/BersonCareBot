"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { LabeledSwitch } from "@/shared/ui/doctor/primitives/labeled-switch";
import type { AuthChannelUiPolicy } from "@/modules/auth/otpChannelUi";

type PolicyKey = keyof AuthChannelUiPolicy;
type SettingKey = `auth_${PolicyKey}_enabled`;

const CHANNELS: ReadonlyArray<{ channel: PolicyKey; label: string; hint: string }> = [
  { channel: "email", label: "Email-коды", hint: "Разрешить вход и регистрацию по одноразовому коду из письма." },
  { channel: "sms", label: "SMS-коды", hint: "Разрешить подтверждение номера и одноразовые коды по SMS." },
  { channel: "telegram", label: "Telegram", hint: "Разрешить вход и привязку через Telegram." },
  { channel: "max", label: "MAX", hint: "Разрешить вход и привязку через MAX." },
];

const EMPTY_POLICY: AuthChannelUiPolicy = { email: false, sms: false, telegram: false, max: false };

function readBoolean(valueJson: unknown): boolean {
  if (typeof valueJson === "boolean") return valueJson;
  if (valueJson && typeof valueJson === "object" && "value" in valueJson) {
    return (valueJson as { value?: unknown }).value === true;
  }
  return false;
}

export function PlatformAuthChannelPolicySection() {
  const [policy, setPolicy] = useState<AuthChannelUiPolicy>(EMPTY_POLICY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<PolicyKey | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/platform/settings", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: Array<{ key?: string; valueJson?: unknown }>;
        };
        if (!active || !response.ok || !data.ok || !Array.isArray(data.settings)) {
          throw new Error("settings_unavailable");
        }
        const next = { ...EMPTY_POLICY };
        for (const channel of CHANNELS) {
          const setting = data.settings.find((item) => item.key === `auth_${channel.channel}_enabled`);
          next[channel.channel] = readBoolean(setting?.valueJson);
        }
        setPolicy(next);
        setLoaded(true);
      })
      .catch(() => {
        if (active) toast.error("Не удалось загрузить настройки способов входа");
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
      const response = await fetch("/api/platform/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value: enabled }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
      if (!response.ok || !data.ok) throw new Error("save_failed");
    } catch {
      setPolicy((current) => ({ ...current, [channel]: previous }));
      toast.error("Не удалось сохранить настройку");
    } finally {
      setSaving(null);
    }
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Доступные способы входа</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="grid gap-4 md:grid-cols-2">
        {CHANNELS.map(({ channel, label, hint }) => (
          <LabeledSwitch
            key={channel}
            label={label}
            hint={hint}
            checked={policy[channel]}
            disabled={!loaded || saving !== null}
            onCheckedChange={(enabled) => void updateChannel(channel, enabled)}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Парольный вход по email остаётся доступен независимо от переключателя email-кодов.
      </p>
    </DoctorSection>
  );
}
