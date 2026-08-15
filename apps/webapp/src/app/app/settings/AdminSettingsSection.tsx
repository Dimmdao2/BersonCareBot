'use client';

import { useMemo, useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { LabeledSwitch } from '@/shared/ui/doctor/primitives/labeled-switch';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import { parseIdTokens } from '@/shared/parsers/parseIdTokens';
import { previewTestAccountPhoneTokens } from '@/modules/system-settings/testAccounts';
import { patchAdminSettingsBatch } from './patchAdminSetting';

export type AdminSettingsSectionProps = {
  devMode: boolean;
  debugForwardToAdmin: boolean;
  /** Полный initData в journalctl webapp при открытии миниаппа (MAX и Telegram). */
  miniappAuthVerboseServerLog: boolean;
  importantFallbackDelayMinutes: number;
  platformUserMergeV2Enabled: boolean;
  /** Тестовые аккаунты: телефоны (пробел/запятая), Telegram ID, Max ID — для техработ и dev_mode relay. */
  testAccountPhones: string;
  testAccountTelegramIds: string;
  testAccountMaxIds: string;
  testAccountEmails: string;
  patientAppMaintenanceEnabled: boolean;
  patientAppMaintenanceMessage: string;
  patientProgramDiscussionDoctorReplyFromLogEnabled: boolean;
  patientProgramDiscussionUiEnabled: boolean;
  patientProgramDiscussionMediaSubmissionEnabled: boolean;
  patientBookingUrl: string;
};

export function AdminSettingsSection({
  devMode,
  debugForwardToAdmin,
  miniappAuthVerboseServerLog,
  importantFallbackDelayMinutes,
  platformUserMergeV2Enabled,
  testAccountPhones,
  testAccountTelegramIds,
  testAccountMaxIds,
  testAccountEmails,
  patientAppMaintenanceEnabled,
  patientAppMaintenanceMessage,
  patientProgramDiscussionDoctorReplyFromLogEnabled,
  patientProgramDiscussionUiEnabled,
  patientProgramDiscussionMediaSubmissionEnabled,
  patientBookingUrl,
}: AdminSettingsSectionProps) {
  const [devModeVal, setDevModeVal] = useState(devMode);
  const [debugForward, setDebugForward] = useState(debugForwardToAdmin);
  const [miniappVerbose, setMiniappVerbose] = useState(miniappAuthVerboseServerLog);
  const [fallbackDelay, setFallbackDelay] = useState(importantFallbackDelayMinutes);
  const [mergeV2, setMergeV2] = useState(platformUserMergeV2Enabled);

  const [testPhonesVal, setTestPhonesVal] = useState(testAccountPhones);
  const [testTgVal, setTestTgVal] = useState(testAccountTelegramIds);
  const [testMaxVal, setTestMaxVal] = useState(testAccountMaxIds);
  const [testEmailsVal, setTestEmailsVal] = useState(testAccountEmails);

  const [maintenanceEnabled, setMaintenanceEnabled] = useState(patientAppMaintenanceEnabled);
  const [maintenanceMessage, setMaintenanceMessage] = useState(patientAppMaintenanceMessage);
  const [discussionDoctorReplyFromLogEnabled, setDiscussionDoctorReplyFromLogEnabled] = useState(
    patientProgramDiscussionDoctorReplyFromLogEnabled,
  );
  const [discussionUiEnabled, setDiscussionUiEnabled] = useState(patientProgramDiscussionUiEnabled);
  const [discussionMediaSubmissionEnabled, setDiscussionMediaSubmissionEnabled] = useState(
    patientProgramDiscussionMediaSubmissionEnabled,
  );
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
      setError('Текст техработ: не более 500 символов');
      return;
    }
    const bookingRaw = bookingUrl.trim();
    if (bookingRaw.length > 0) {
      try {
        const u = new URL(bookingRaw);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          setError('Ссылка записи: укажите URL с http:// или https:// либо оставьте пустым');
          return;
        }
      } catch {
        setError('Ссылка записи: неверный URL');
        return;
      }
    }

    startTransition(async () => {
      try {
        const testPayload = {
          phones: parseIdTokens(testPhonesVal),
          telegramIds: parseIdTokens(testTgVal),
          maxIds: parseIdTokens(testMaxVal),
          emails: parseIdTokens(testEmailsVal),
        };

        const batchResult = await patchAdminSettingsBatch([
          { key: 'dev_mode', value: devModeVal },
          { key: 'debug_forward_to_admin', value: debugForward },
          { key: 'max_debug_page_enabled', value: miniappVerbose },
          { key: 'important_fallback_delay_minutes', value: fallbackDelay },
          { key: 'platform_user_merge_v2_enabled', value: mergeV2 },
          { key: 'test_account_identifiers', value: testPayload },
          { key: 'patient_app_maintenance_enabled', value: maintenanceEnabled },
          { key: 'patient_app_maintenance_message', value: msgRaw },
          {
            key: 'patient_program_discussion_doctor_reply_from_log_enabled',
            value: discussionDoctorReplyFromLogEnabled,
          },
          { key: 'patient_program_discussion_ui_enabled', value: discussionUiEnabled },
          {
            key: 'patient_program_discussion_media_submission_enabled',
            value: discussionMediaSubmissionEnabled,
          },
          { key: 'patient_booking_url', value: bookingRaw },
        ]);
        if (!batchResult.ok) {
          const idx = batchResult.atIndex;
          const key = batchResult.key;
          const suffix =
            typeof idx === 'number'
              ? ` (элемент ${idx + 1}${key != null ? `, ключ ${key}` : ''})`
              : '';
          setError(
            batchResult.error === 'duplicate_key_in_batch'
              ? 'В запросе повторяется один и тот же ключ настроек'
              : batchResult.error === 'ambiguous_body'
                ? 'Некорректное тело запроса (лишние поля)'
                : batchResult.error === 'empty_batch'
                  ? 'Пустой список настроек'
                  : batchResult.error === 'invalid_value'
                    ? `Некорректное значение${suffix}`
                    : 'Не удалось сохранить настройки',
          );
          return;
        }
        setSaved(true);
      } catch {
        setError('Ошибка при сохранении');
      }
    });
  }

  return (
    <Card className="border-destructive/50 ring-destructive/20">
      <CardHeader>
        <CardTitle className="text-destructive">Режимы</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ключи в БД (<code className="rounded bg-muted px-1">system_settings</code>, scope admin).
          Свой числовой ID в Telegram или Max — команда{' '}
          <span className="font-mono">/show_my_id</span> в личном чате с ботом.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-4">
          <p className="text-sm font-semibold">Тестовые аккаунты</p>
          <p className="text-xs text-muted-foreground">
            При включённых техработах пациентского приложения эти аккаунты видят полный интерфейс.
            При dev_mode рассылки уходят только на перечисленные Telegram / Max ID, номера SMS и
            адреса e-mail.
          </p>
          <DoctorField label="Телефоны (пробел, запятая)" htmlFor="test-account-phones" width="lg">
            <Input
              id="test-account-phones"
              type="text"
              value={testPhonesVal}
              onChange={(e) => setTestPhonesVal(e.target.value)}
              disabled={isPending}
              className="font-mono text-sm"
            />
          </DoctorField>
          {(testPhonesPreview.rejected.length > 0 || testPhonesPreview.truncatedAfterCap) && (
            <div className="max-w-[var(--doctor-field-lg,40rem)] rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
              {testPhonesPreview.rejected.length > 0 && (
                <p>
                  <span className="font-medium">
                    Не попадут в сохранённый список (невалидный E.164 или лимит):{' '}
                  </span>
                  {testPhonesPreview.rejected.slice(0, 12).join(', ')}
                  {testPhonesPreview.rejected.length > 12
                    ? ` (+ещё ${testPhonesPreview.rejected.length - 12})`
                    : ''}
                </p>
              )}
              {testPhonesPreview.truncatedAfterCap && (
                <p className="mt-1 font-medium">Дальше 200 номеров в списке сервер не сохраняет.</p>
              )}
            </div>
          )}
          <DoctorField label="Telegram ID" htmlFor="test-account-telegram-ids" width="lg">
            <Input
              id="test-account-telegram-ids"
              type="text"
              value={testTgVal}
              onChange={(e) => setTestTgVal(e.target.value)}
              disabled={isPending}
              className="font-mono text-sm"
            />
          </DoctorField>
          <DoctorField label="Max ID" htmlFor="test-account-max-ids" width="lg">
            <Input
              id="test-account-max-ids"
              type="text"
              value={testMaxVal}
              onChange={(e) => setTestMaxVal(e.target.value)}
              disabled={isPending}
              className="font-mono text-sm"
            />
          </DoctorField>
          <DoctorField label="E-mail (пробел, запятая)" htmlFor="test-account-emails" width="lg">
            <Input
              id="test-account-emails"
              type="text"
              value={testEmailsVal}
              onChange={(e) => setTestEmailsVal(e.target.value)}
              disabled={isPending}
              className="font-mono text-sm"
            />
          </DoctorField>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-4">
          <p className="text-sm font-semibold">Режим техработ пациентского приложения</p>
          <p className="text-xs text-muted-foreground">
            Для роли «клиент» под <code className="rounded bg-muted px-1">/app/patient</code> обычно
            показывается экран техработ; тестовые аккаунты (блок выше) — полный UI. Врач/админ не
            затрагиваются.
          </p>
          <LabeledSwitch
            label="Включить режим техработ для пациентов"
            checked={maintenanceEnabled}
            onCheckedChange={(v) => setMaintenanceEnabled(Boolean(v))}
            disabled={isPending}
            switchClassName="data-checked:bg-destructive dark:data-checked:bg-destructive"
          />
          <DoctorField
            label="Текст на экране"
            htmlFor="patient-maintenance-message"
            width="lg"
            hint="До 500 символов; пусто — текст по умолчанию из кода."
          >
            <Textarea
              id="patient-maintenance-message"
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              disabled={isPending}
              rows={4}
              className="resize-y"
            />
          </DoctorField>
          <DoctorField
            label="Ссылка «Записаться на приём» (внешняя)"
            htmlFor="patient-maintenance-booking-url"
            width="lg"
            hint="Пусто — кнопка записи для пациента не показывается."
          >
            <Input
              id="patient-maintenance-booking-url"
              type="url"
              placeholder="https://booking.example.ru"
              value={bookingUrl}
              onChange={(e) => setBookingUrl(e.target.value)}
              disabled={isPending}
              autoComplete="off"
            />
          </DoctorField>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-4">
          <p className="text-sm font-semibold">Обсуждения в программе лечения</p>
          <LabeledSwitch
            label="Doctor: ответ из журнала программы"
            checked={discussionDoctorReplyFromLogEnabled}
            onCheckedChange={(v) => setDiscussionDoctorReplyFromLogEnabled(Boolean(v))}
            disabled={isPending}
            switchClassName="data-checked:bg-destructive dark:data-checked:bg-destructive"
          />
          <LabeledSwitch
            label="Patient: UI обсуждений по элементам"
            checked={discussionUiEnabled}
            onCheckedChange={(v) => setDiscussionUiEnabled(Boolean(v))}
            disabled={isPending}
            switchClassName="data-checked:bg-destructive dark:data-checked:bg-destructive"
          />
          <LabeledSwitch
            label="Patient: загрузка фото/видео в обсуждение"
            checked={discussionMediaSubmissionEnabled}
            onCheckedChange={(v) => setDiscussionMediaSubmissionEnabled(Boolean(v))}
            disabled={isPending}
            switchClassName="data-checked:bg-destructive dark:data-checked:bg-destructive"
          />
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
          label="Debug: подробные серверные логи"
          hint="Включает подробные operational-логи webapp и integrator (journalctl). Не меняет доставку сообщений. На проде держать выключенным."
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

        <DoctorField
          label="Задержка SMS fallback для важных сообщений (минут)"
          htmlFor="fallback-delay-input"
          width="sm"
          hint="Если важное сообщение не прочитано за это время — уходит SMS."
        >
          <Input
            id="fallback-delay-input"
            type="number"
            min={1}
            max={1440}
            value={fallbackDelay}
            onChange={(e) => setFallbackDelay(Math.max(1, Number(e.target.value)))}
            disabled={isPending}
          />
        </DoctorField>

        <div className="flex items-center gap-3">
          <Button variant="destructive" onClick={handleSave} disabled={isPending}>
            {isPending ? 'Сохранение...' : 'Сохранить настройки'}
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
