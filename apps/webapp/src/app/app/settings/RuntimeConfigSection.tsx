"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RuntimeConfigValues = {
  /** HTTPS ссылка поддержки (t.me и т.п.), см. getSupportContactUrl. */
  supportContactUrl: string;
  /** JSON-array strings */
  allowedTelegramIds: string;
  allowedMaxIds: string;
  adminTelegramIds: string;
  doctorTelegramIds: string;
  adminMaxIds: string;
  doctorMaxIds: string;
};

async function patchSetting(key: string, value: unknown): Promise<boolean> {
  const res = await fetch("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value: { value } }),
  });
  return res.ok;
}

function parseIdArray(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // comma-separated fallback
  }
  return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
}

type Props = RuntimeConfigValues;

export function RuntimeConfigSection({
  supportContactUrl,
  allowedTelegramIds,
  allowedMaxIds,
  adminTelegramIds,
  doctorTelegramIds,
  adminMaxIds,
  doctorMaxIds,
}: Props) {
  const [vals, setVals] = useState({
    supportContactUrl,
    allowedTelegramIds,
    allowedMaxIds,
    adminTelegramIds,
    doctorTelegramIds,
    adminMaxIds,
    doctorMaxIds,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = (k: keyof typeof vals) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setVals((v) => ({ ...v, [k]: e.target.value }));
  };

  async function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const supportRaw = vals.supportContactUrl.trim();
        if (supportRaw.length > 0) {
          try {
            const u = new URL(supportRaw);
            if (u.protocol !== "https:" && u.protocol !== "http:") {
              setError("Ссылка поддержки: только http(s)://");
              return;
            }
          } catch {
            setError("Ссылка поддержки: укажите валидный URL (например https://t.me/…)");
            return;
          }
        }
        const results = await Promise.all([
          patchSetting("support_contact_url", supportRaw),
          patchSetting("allowed_telegram_ids", parseIdArray(vals.allowedTelegramIds)),
          patchSetting("allowed_max_ids", parseIdArray(vals.allowedMaxIds)),
          patchSetting("admin_telegram_ids", parseIdArray(vals.adminTelegramIds)),
          patchSetting("doctor_telegram_ids", parseIdArray(vals.doctorTelegramIds)),
          patchSetting("admin_max_ids", parseIdArray(vals.adminMaxIds)),
          patchSetting("doctor_max_ids", parseIdArray(vals.doctorMaxIds)),
        ]);
        if (results.some((r) => !r)) {
          setError("Не удалось сохранить часть настроек");
          return;
        }
        setSaved(true);
      } catch {
        setError("Ошибка при сохранении");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime конфиг (DB)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Изменения применяются сразу. Интеграционные ключи и секреты управляются через env.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">

        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Контакты</h3>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Support contact URL (HTTPS)</span>
            <Input
              type="url"
              placeholder="https://t.me/your_support"
              value={vals.supportContactUrl}
              onChange={set("supportContactUrl")}
              disabled={isPending}
            />
            <span className="text-xs text-muted-foreground">
              Ссылка «Написать в поддержку» в формах OTP и на странице справки. Пустое — дефолт из кода.
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Вайтлисты (JSON или через запятую)</h3>
          {([
            ["allowedTelegramIds", "Разрешённые Telegram ID (клиенты)"],
            ["adminTelegramIds", "Telegram ID → admin"],
            ["doctorTelegramIds", "Telegram ID → doctor"],
            ["allowedMaxIds", "Разрешённые Max ID (клиенты)"],
            ["adminMaxIds", "Max ID → admin"],
            ["doctorMaxIds", "Max ID → doctor"],
          ] as [keyof typeof vals, string][]).map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-xs font-medium">{label}</span>
              <textarea
                className="min-h-16 rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                placeholder='["123456789"]'
                value={vals[k]}
                onChange={set(k)}
                disabled={isPending}
              />
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleSave} disabled={isPending}>
            {isPending ? "Сохранение…" : "Сохранить"}
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
