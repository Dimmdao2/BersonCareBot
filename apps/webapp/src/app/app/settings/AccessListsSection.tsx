"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseIdTokens } from "@/shared/parsers/parseIdTokens";
import { patchAdminSetting } from "./patchAdminSetting";

type AccessListsValues = {
  allowedTelegramIds: string;
  allowedMaxIds: string;
  adminTelegramIds: string;
  doctorTelegramIds: string;
  adminMaxIds: string;
  doctorMaxIds: string;
};

export type AccessListsSectionProps = AccessListsValues;

const FIELDS: [keyof AccessListsValues, string][] = [
  ["allowedTelegramIds", "Разрешённые Telegram ID (клиенты)"],
  ["adminTelegramIds", "Telegram ID → admin"],
  ["doctorTelegramIds", "Telegram ID → doctor"],
  ["allowedMaxIds", "Разрешённые Max ID (клиенты)"],
  ["adminMaxIds", "Max ID → admin"],
  ["doctorMaxIds", "Max ID → doctor"],
];

export function AccessListsSection({
  allowedTelegramIds,
  allowedMaxIds,
  adminTelegramIds,
  doctorTelegramIds,
  adminMaxIds,
  doctorMaxIds,
}: AccessListsSectionProps) {
  const [vals, setVals] = useState<AccessListsValues>({
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

  const set =
    (k: keyof AccessListsValues) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setVals((v) => ({ ...v, [k]: e.target.value }));
    };

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const results = await Promise.all([
          patchAdminSetting("allowed_telegram_ids", parseIdTokens(vals.allowedTelegramIds)),
          patchAdminSetting("allowed_max_ids", parseIdTokens(vals.allowedMaxIds)),
          patchAdminSetting("admin_telegram_ids", parseIdTokens(vals.adminTelegramIds)),
          patchAdminSetting("doctor_telegram_ids", parseIdTokens(vals.doctorTelegramIds)),
          patchAdminSetting("admin_max_ids", parseIdTokens(vals.adminMaxIds)),
          patchAdminSetting("doctor_max_ids", parseIdTokens(vals.doctorMaxIds)),
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
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Доступ и роли</CardTitle>
        <p className="text-xs text-muted-foreground">
          Идентификаторы Telegram / Max для разрешения ролей. Несколько значений: пробел, запятая или новая строка.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-4">
          <p className="text-sm font-semibold">Вайтлисты</p>
          {FIELDS.map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-xs font-medium">{label}</span>
              <textarea
                className="min-h-16 rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                placeholder="123456789 987654321 max-user-1"
                value={vals[k]}
                onChange={set(k)}
                disabled={isPending}
              />
            </label>
          ))}
        </section>

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
