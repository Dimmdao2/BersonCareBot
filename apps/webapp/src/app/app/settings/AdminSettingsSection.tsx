"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";
import { parseIdTokens } from "@/shared/parsers/parseIdTokens";
import { normalizePhone } from "@/modules/auth/phoneAuth";
import { isValidPhoneE164 } from "@/modules/auth/phoneValidation";
import { previewTestAccountPhoneTokens } from "@/modules/system-settings/testAccounts";
import { patchAdminSettingsBatch } from "./patchAdminSetting";

export type IntegratorLinkedPhoneSource = "public_then_contacts" | "public_only" | "contacts_only";

export type AdminSettingsSectionProps = {
  devMode: boolean;
  debugForwardToAdmin: boolean;
  /** Полный initData в journalctl webapp при открытии миниаппа (MAX и Telegram). */
  miniappAuthVerboseServerLog: boolean;
  importantFallbackDelayMinutes: number;
  platformUserMergeV2Enabled: boolean;
  /** Как integrator собирает `linkedPhone`: public vs legacy `integrator.contacts`. */
  integratorLinkedPhoneSource: IntegratorLinkedPhoneSource;
  /** Первый админский телефон (остальные слоты в БД не редактируются из этого поля). */
  adminPhone: string;
  adminTelegramId: string;
  adminMaxId: string;
  /** Тестовые аккаунты: телефоны (пробел/запятая), Telegram ID, Max ID — для техработ и dev_mode relay. */
  testAccountPhones: string;
  testAccountTelegramIds: string;
  testAccountMaxIds: string;
  patientAppMaintenanceEnabled: boolean;
  patientAppMaintenanceMessage: string;
  patientBookingUrl: string;
};

function firstPhoneTokenForAdminSave(raw: string): string[] {
  const tokens = parseIdTokens(raw);
  if (tokens.length === 0) return [];
  const n = normalizePhone(tokens[0]!);
  if (!isValidPhoneE164(n)) return [];
  return [n];
}

function firstIdTokenForAdminSave(raw: string): string[] {
  const tokens = parseIdTokens(raw);
  if (tokens.length === 0) return [];
  return [tokens[0]!];
}

export function AdminSettingsSection({
  devMode,
  debugForwardToAdmin,
  miniappAuthVerboseServerLog,
  importantFallbackDelayMinutes,
  platformUserMergeV2Enabled,
  integratorLinkedPhoneSource,
  adminPhone,
  adminTelegramId,
  adminMaxId,
  testAccountPhones,
  testAccountTelegramIds,
  testAccountMaxIds,
  patientAppMaintenanceEnabled,
  patientAppMaintenanceMessage,
  patientBookingUrl,
}: AdminSettingsSectionProps) {
  const [devModeVal, setDevModeVal] = useState(devMode);
  const [debugForward, setDebugForward] = useState(debugForwardToAdmin);
  const [miniappVerbose, setMiniappVerbose] = useState(miniappAuthVerboseServerLog);
  const [fallbackDelay, setFallbackDelay] = useState(importantFallbackDelayMinutes);
  const [mergeV2, setMergeV2] = useState(platformUserMergeV2Enabled);
  const [linkedPhoneSource, setLinkedPhoneSource] = useState(integratorLinkedPhoneSource);

  const [adminPhoneVal, setAdminPhoneVal] = useState(adminPhone);
  const [adminTgVal, setAdminTgVal] = useState(adminTelegramId);
  const [adminMaxVal, setAdminMaxVal] = useState(adminMaxId);

  const [testPhonesVal, setTestPhonesVal] = useState(testAccountPhones);
  const [testTgVal, setTestTgVal] = useState(testAccountTelegramIds);
  const [testMaxVal, setTestMaxVal] = useState(testAccountMaxIds);

  const [maintenanceEnabled, setMaintenanceEnabled] = useState(patientAppMaintenanceEnabled);
  const [maintenanceMessage, setMaintenanceMessage] = useState(patientAppMaintenanceMessage);
  const [bookingUrl, setBookingUrl] = useState(patientBookingUrl);

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const testPhonesPreview = useMemo(
    () => previewTestAccountPhoneTokens(parseIdTokens(testPhonesVal)),
    [testPhonesVal],
  );

  async function handleSave() {
    setSaved(false);
    setError(null);

    const msgRaw = maintenanceMessage.trim();
    if (msgRaw.length > 500) {
      setError("Текст техработ: не более 500 символов");
      return;
    }
    const bookingRaw = bookingUrl.trim();
    if (bookingRaw.length > 0) {
      try {
        const u = new URL(bookingRaw);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          setError("Ссылка записи: укажите URL с http:// или https:// либо оставьте пустым");
          return;
        }
      } catch {
        setError("Ссылка записи: неверный URL");
        return;
      }
    }

    const adminPhonesPayload = firstPhoneTokenForAdminSave(adminPhoneVal);
    if (adminPhoneVal.trim().length > 0 && adminPhonesPayload.length === 0) {
      setError("Телефон администратора: укажите валидный номер в формате E.164 или оставьте пустым");
      return;
    }

    startTransition(async () => {
      try {
        const testPayload = {
          phones: parseIdTokens(testPhonesVal),
          telegramIds: parseIdTokens(testTgVal),
          maxIds: parseIdTokens(testMaxVal),
        };

        const batchResult = await patchAdminSettingsBatch([
          { key: "dev_mode", value: devModeVal },
          { key: "debug_forward_to_admin", value: debugForward },
          { key: "max_debug_page_enabled", value: miniappVerbose },
          { key: "important_fallback_delay_minutes", value: fallbackDelay },
          { key: "platform_user_merge_v2_enabled", value: mergeV2 },
          { key: "integrator_linked_phone_source", value: linkedPhoneSource },
          { key: "admin_phones", value: adminPhonesPayload },
          { key: "admin_telegram_ids", value: firstIdTokenForAdminSave(adminTgVal) },
          { key: "admin_max_ids", value: firstIdTokenForAdminSave(adminMaxVal) },
          { key: "test_account_identifiers", value: testPayload },
          { key: "patient_app_maintenance_enabled", value: maintenanceEnabled },
          { key: "patient_app_maintenance_message", value: msgRaw },
          { key: "patient_booking_url", value: bookingRaw },
        ]);
        if (!batchResult.ok) {
          const idx = batchResult.atIndex;
          const key = batchResult.key;
          const suffix =
            typeof idx === "number"
              ? ` (элемент ${idx + 1}${key != null ? `, ключ ${key}` : ""})`
              : "";
          setError(
            batchResult.error === "duplicate_key_in_batch"
              ? "В запросе повторяется один и тот же ключ настроек"
              : batchResult.error === "ambiguous_body"
                ? "Некорректное тело запроса (лишние поля)"
                : batchResult.error === "empty_batch"
                  ? "Пустой список настроек"
                  : batchResult.error === "invalid_value"
                    ? `Некорректное значение${suffix}`
                    : "Не удалось сохранить настройки",
          );
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
        <CardTitle className="text-destructive">Режимы</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ключи в БД (<code className="rounded bg-muted px-1">system_settings</code>, scope admin). Свой числовой ID в
          Telegram или Max — команда <span className="font-mono">/show_my_id</span> в личном чате с ботом.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-4">
          <p className="text-sm font-semibold">Администратор</p>
          <p className="text-xs text-muted-foreground">
            Один телефон и один ID на канал (сохраняется как первый элемент списка в БД; остальные слоты не трогаем).
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Телефон (E.164)</span>
            <Input
              type="text"
              value={adminPhoneVal}
              onChange={(e) => setAdminPhoneVal(e.target.value)}
              disabled={isPending}
              autoComplete="off"
              className="max-w-xl font-mono text-sm"
              placeholder="+79990000000"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Telegram ID</span>
            <Input
              type="text"
              value={adminTgVal}
              onChange={(e) => setAdminTgVal(e.target.value)}
              disabled={isPending}
              autoComplete="off"
              className="max-w-xl font-mono text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Max ID</span>
            <Input
              type="text"
              value={adminMaxVal}
              onChange={(e) => setAdminMaxVal(e.target.value)}
              disabled={isPending}
              autoComplete="off"
              className="max-w-xl font-mono text-sm"
            />
          </label>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-4">
          <p className="text-sm font-semibold">Тестовые аккаунты</p>
          <p className="text-xs text-muted-foreground">
            При включённых техработах пациентского приложения эти аккаунты видят полный интерфейс. При dev_mode
            рассылки уходят только на перечисленные Telegram / Max ID (и телефон для будущих SMS-каналов).
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Телефоны (пробел, запятая)</span>
            <Input
              type="text"
              value={testPhonesVal}
              onChange={(e) => setTestPhonesVal(e.target.value)}
              disabled={isPending}
              className="max-w-2xl font-mono text-sm"
            />
            {(testPhonesPreview.rejected.length > 0 || testPhonesPreview.truncatedAfterCap) && (
              <div className="max-w-2xl rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                {testPhonesPreview.rejected.length > 0 && (
                  <p>
                    <span className="font-medium">Не попадут в сохранённый список (невалидный E.164 или лимит): </span>
                    {testPhonesPreview.rejected.slice(0, 12).join(", ")}
                    {testPhonesPreview.rejected.length > 12
                      ? ` (+ещё ${testPhonesPreview.rejected.length - 12})`
                      : ""}
                  </p>
                )}
                {testPhonesPreview.truncatedAfterCap && (
                  <p className="mt-1 font-medium">Дальше 200 номеров в списке сервер не сохраняет.</p>
                )}
              </div>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Telegram ID</span>
            <Input
              type="text"
              value={testTgVal}
              onChange={(e) => setTestTgVal(e.target.value)}
              disabled={isPending}
              className="max-w-2xl font-mono text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Max ID</span>
            <Input
              type="text"
              value={testMaxVal}
              onChange={(e) => setTestMaxVal(e.target.value)}
              disabled={isPending}
              className="max-w-2xl font-mono text-sm"
            />
          </label>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-4">
          <p className="text-sm font-semibold">Режим техработ пациентского приложения</p>
          <p className="text-xs text-muted-foreground">
            Для роли «клиент» под <code className="rounded bg-muted px-1">/app/patient</code> обычно показывается экран
            техработ; тестовые аккаунты (блок выше) — полный UI. Врач/админ не затрагиваются.
          </p>
          <LabeledSwitch
            label="Включить режим техработ для пациентов"
            checked={maintenanceEnabled}
            onCheckedChange={(v) => setMaintenanceEnabled(Boolean(v))}
            disabled={isPending}
            switchClassName="data-checked:bg-destructive dark:data-checked:bg-destructive"
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Текст на экране</span>
            <Textarea
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              disabled={isPending}
              rows={4}
              className="max-w-2xl resize-y"
            />
            <span className="text-xs text-muted-foreground">До 500 символов; пусто — текст по умолчанию из кода.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Ссылка «Записаться на приём» (внешняя)</span>
            <Input
              type="url"
              placeholder="https://dmitryberson.rubitime.ru"
              value={bookingUrl}
              onChange={(e) => setBookingUrl(e.target.value)}
              disabled={isPending}
              autoComplete="off"
              className="max-w-2xl"
            />
            <span className="text-xs text-muted-foreground">Пусто — URL по умолчанию (Rubitime).</span>
          </label>
        </section>

        <LabeledSwitch
          label="Dev mode"
          hint="При включении исходящие relay-сообщения только на тестовые Telegram / Max ID из списка выше"
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
          label="Mini App: полный initData в логах сервера (journalctl)"
          hint="Включает запись сырой строки initData от Telegram и MAX в лог процесса webapp при POST /api/auth/telegram-init и max-init. Содержит идентификаторы и подпись — только кратковременно для отладки, на проде выключено."
          checked={miniappVerbose}
          onCheckedChange={setMiniappVerbose}
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
          <label className="text-sm font-medium" htmlFor="integrator-linked-phone-source">
            Integrator: источник linkedPhone
          </label>
          <select
            id="integrator-linked-phone-source"
            className="max-w-xl rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={linkedPhoneSource}
            onChange={(e) => setLinkedPhoneSource(e.target.value as IntegratorLinkedPhoneSource)}
            disabled={isPending}
          >
            <option value="public_then_contacts">
              public_then_contacts — сначала public.platform_users, иначе legacy contacts (по умолчанию)
            </option>
            <option value="public_only">public_only — только канон webapp (целевой режим)</option>
            <option value="contacts_only">contacts_only — только legacy contacts (аварийный откат)</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Влияет на /start и меню: при public_only без телефона в public потребуется контакт, даже если номер остался
            только в integrator.contacts.
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
