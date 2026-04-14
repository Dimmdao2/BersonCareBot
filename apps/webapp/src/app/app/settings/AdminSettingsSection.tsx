"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";
import { parseIdTokens } from "@/shared/parsers/parseIdTokens";

type AdminSettings = {
  devMode: boolean;
  debugForwardToAdmin: boolean;
  /** Показ маршрута `/max-debug` (диагностика MAX Mini App); без включения — 404. */
  maxDebugPageEnabled: boolean;
  integrationTestIds: string[];
  importantFallbackDelayMinutes: number;
  platformUserMergeV2Enabled: boolean;
};

type AdminSettingsSectionProps = AdminSettings;

async function patchAdminSetting(key: string, value: unknown): Promise<boolean> {
  const res = await fetch("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    // Значения хранятся в формате {value: X} — совместимо с seed и shouldDispatch
    body: JSON.stringify({ key, value: { value } }),
  });
  return res.ok;
}

export function AdminSettingsSection({
  devMode,
  debugForwardToAdmin,
  maxDebugPageEnabled,
  integrationTestIds,
  importantFallbackDelayMinutes,
  platformUserMergeV2Enabled,
}: AdminSettingsSectionProps) {
  const [devModeVal, setDevModeVal] = useState(devMode);
  const [debugForward, setDebugForward] = useState(debugForwardToAdmin);
  const [maxDebug, setMaxDebug] = useState(maxDebugPageEnabled);
  const [testIdsText, setTestIdsText] = useState(() => integrationTestIds.join(" "));
  const [fallbackDelay, setFallbackDelay] = useState(importantFallbackDelayMinutes);
  const [mergeV2, setMergeV2] = useState(platformUserMergeV2Enabled);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSave() {
    setSaved(false);
    setError(null);

    const testIds = parseIdTokens(testIdsText);

    startTransition(async () => {
      try {
        const results = await Promise.all([
          patchAdminSetting("dev_mode", devModeVal),
          patchAdminSetting("debug_forward_to_admin", debugForward),
          patchAdminSetting("max_debug_page_enabled", maxDebug),
          patchAdminSetting("integration_test_ids", testIds),
          patchAdminSetting("important_fallback_delay_minutes", fallbackDelay),
          patchAdminSetting("platform_user_merge_v2_enabled", mergeV2),
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
    <Card className="border-destructive/50 ring-destructive/20">
      <CardHeader>
        <CardTitle className="text-destructive">Настройки администратора</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <LabeledSwitch
          label="Dev mode"
          hint="При включении рассылки уходят только на тестовые аккаунты"
          checked={devModeVal}
          onCheckedChange={setDevModeVal}
          disabled={isPending}
          switchClassName="data-checked:bg-destructive dark:data-checked:bg-destructive"
        />

        <LabeledSwitch
          label="Debug: пересылать входящие админу"
          hint="Пересылать все входящие сообщения администратору для отладки"
          checked={debugForward}
          onCheckedChange={setDebugForward}
          disabled={isPending}
          switchClassName="data-checked:bg-destructive dark:data-checked:bg-destructive"
        />

        <LabeledSwitch
          label="Страница /max-debug (диагностика MAX Mini App)"
          hint="Показывать маршрут с сырым initData в браузере. На проде держите выключенным; для staging включайте по необходимости."
          checked={maxDebug}
          onCheckedChange={setMaxDebug}
          disabled={isPending}
          switchClassName="data-checked:bg-destructive dark:data-checked:bg-destructive"
        />

        <LabeledSwitch
          label="Ручной merge клиентов: сценарий v2 (integrator → webapp)"
          hint="При разных integrator_user_id: сначала canonical merge в integrator, затем webapp merge. Выкл. = поведение v1 (жёсткий запрет)."
          checked={mergeV2}
          onCheckedChange={setMergeV2}
          disabled={isPending}
          switchClassName="data-checked:bg-destructive dark:data-checked:bg-destructive"
        />

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="test-ids-textarea">
            Тестовые ID (пробел, запятая, новая строка)
          </label>
          <textarea
            id="test-ids-textarea"
            className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={testIdsText}
            onChange={(e) => setTestIdsText(e.target.value)}
            disabled={isPending}
            placeholder="12345 67890 max-user-1"
          />
          <p className="text-xs text-muted-foreground">
            Используется при dev_mode = true: только эти пользователи получают рассылки
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="fallback-delay-input">
            Задержка SMS fallback для важных сообщений (минут)
          </label>
          <input
            id="fallback-delay-input"
            type="number"
            min={1}
            max={1440}
            className="w-32 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={fallbackDelay}
            onChange={(e) => setFallbackDelay(Math.max(1, Number(e.target.value)))}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Если важное сообщение не прочитано за это время — уходит SMS
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="destructive" onClick={handleSave} disabled={isPending}>
            {isPending ? "Сохранение..." : "Сохранить настройки"}
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
