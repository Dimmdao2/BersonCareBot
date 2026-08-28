'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { LabeledSwitch } from '@/shared/ui/doctor/primitives/labeled-switch';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import { patchAdminSettingsBatch } from './patchAdminSetting';

export type AdminSettingsSectionProps = {
  importantFallbackDelayMinutes: number;
  patientAppMaintenanceEnabled: boolean;
  patientAppMaintenanceMessage: string;
  patientProgramDiscussionDoctorReplyFromLogEnabled: boolean;
  patientProgramDiscussionUiEnabled: boolean;
  patientProgramDiscussionMediaSubmissionEnabled: boolean;
  patientBookingUrl: string;
  materialRatingsEnabled: boolean;
};

export function AdminSettingsSection({
  importantFallbackDelayMinutes,
  patientAppMaintenanceEnabled,
  patientAppMaintenanceMessage,
  patientProgramDiscussionDoctorReplyFromLogEnabled,
  patientProgramDiscussionUiEnabled,
  patientProgramDiscussionMediaSubmissionEnabled,
  patientBookingUrl,
  materialRatingsEnabled,
}: AdminSettingsSectionProps) {
  const [fallbackDelay, setFallbackDelay] = useState(importantFallbackDelayMinutes);

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
  const [ratingsEnabled, setRatingsEnabled] = useState(materialRatingsEnabled);

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
        const batchResult = await patchAdminSettingsBatch([
          { key: 'important_fallback_delay_minutes', value: fallbackDelay },
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
          { key: 'material_ratings_enabled', value: ratingsEnabled },
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
          Управляемые продуктовые настройки. Свойства DEV/TEST задаются окружением сервера.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <LabeledSwitch
          label="Оценки материалов"
          checked={ratingsEnabled}
          onCheckedChange={(value) => setRatingsEnabled(Boolean(value))}
          disabled={isPending}
        />

        <section className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-4">
          <p className="text-sm font-semibold">Режим техработ пациентского приложения</p>
          <p className="text-xs text-muted-foreground">
            Показывает экран техработ пациентам и пользователям кабинетов клиник. Глобальный
            администратор сохраняет доступ, чтобы выключить режим.
          </p>
          <LabeledSwitch
            label="Включить режим техработ"
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
