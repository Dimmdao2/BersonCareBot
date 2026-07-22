"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { LabeledSwitch } from "@/shared/ui/doctor/primitives/labeled-switch";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import type { AuthChannelUiPolicy } from "@/modules/auth/otpChannelUi";

type PolicyKey = keyof AuthChannelUiPolicy;
type SettingKey = `auth_${PolicyKey}_enabled`;
const UNSUPPORTED_CLIENT_FALLBACK_KEY = "patient_unsupported_client_fallback_enabled" as const;
const ADMIN_EMAILS_KEY = "admin_emails" as const;
type SavingKey = PolicyKey | typeof UNSUPPORTED_CLIENT_FALLBACK_KEY | typeof ADMIN_EMAILS_KEY;

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

function readFirstEmail(valueJson: unknown): string {
  if (!valueJson || typeof valueJson !== "object" || !("value" in valueJson)) return "";
  const value = (valueJson as { value?: unknown }).value;
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : "";
}

export function PlatformAuthChannelPolicySection() {
  const [policy, setPolicy] = useState<AuthChannelUiPolicy>(EMPTY_POLICY);
  const [unsupportedClientFallbackEnabled, setUnsupportedClientFallbackEnabled] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminEmailDraft, setAdminEmailDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<SavingKey | null>(null);

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
        setUnsupportedClientFallbackEnabled(readBoolean(
          data.settings.find((item) => item.key === UNSUPPORTED_CLIENT_FALLBACK_KEY)?.valueJson,
        ));
        const savedAdminEmail = readFirstEmail(
          data.settings.find((item) => item.key === ADMIN_EMAILS_KEY)?.valueJson,
        );
        setAdminEmail(savedAdminEmail);
        setAdminEmailDraft(savedAdminEmail);
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

  async function updateUnsupportedClientFallback(enabled: boolean): Promise<void> {
    const previous = unsupportedClientFallbackEnabled;
    setUnsupportedClientFallbackEnabled(enabled);
    setSaving(UNSUPPORTED_CLIENT_FALLBACK_KEY);
    try {
      const response = await fetch("/api/platform/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: UNSUPPORTED_CLIENT_FALLBACK_KEY, value: enabled }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
      if (!response.ok || !data.ok) throw new Error("save_failed");
    } catch {
      setUnsupportedClientFallbackEnabled(previous);
      toast.error("Не удалось сохранить настройку");
    } finally {
      setSaving(null);
    }
  }

  async function updateAdminEmail(): Promise<void> {
    const normalized = adminEmailDraft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      toast.error("Укажите корректный email");
      return;
    }
    const previous = adminEmail;
    setAdminEmail(normalized);
    setSaving(ADMIN_EMAILS_KEY);
    try {
      const response = await fetch("/api/platform/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: ADMIN_EMAILS_KEY, value: [normalized] }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
      if (!response.ok || !data.ok) throw new Error("save_failed");
    } catch {
      setAdminEmail(previous);
      toast.error("Не удалось сохранить email глобального администратора");
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
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Глобальный администратор</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
            Email для входа по коду
            <Input
              type="email"
              value={adminEmailDraft}
              onChange={(event) => setAdminEmailDraft(event.target.value)}
              disabled={!loaded || saving !== null}
              autoComplete="email"
              placeholder="admin@example.com"
            />
          </label>
          <Button type="button" disabled={!loaded || saving !== null} onClick={() => void updateAdminEmail()}>
            Сохранить
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          После подтверждения кода из письма этот адрес получает глобальный доступ. Текущий адрес: {adminEmail || "не задан"}.
        </p>
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
