'use client';

import { useState, useTransition } from 'react';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { LabeledSwitch } from '@/components/common/form/LabeledSwitch';

type SettingsFormProps = {
  patientLabel: string;
  supportCommentsWithoutSupportDefault: boolean;
  supportMediaWithoutSupportDefault: boolean;
  settingsEndpoint?: '/api/doctor/settings' | '/api/admin/settings';
  showPatientLabel?: boolean;
  showSupportDefaults?: boolean;
};

export function SettingsForm({
  patientLabel,
  supportCommentsWithoutSupportDefault,
  supportMediaWithoutSupportDefault,
  settingsEndpoint = '/api/doctor/settings',
  showPatientLabel = true,
  showSupportDefaults = true,
}: SettingsFormProps) {
  const [label, setLabel] = useState(patientLabel);
  const [supportCommentsDefault, setSupportCommentsDefault] = useState(
    supportCommentsWithoutSupportDefault,
  );
  const [supportMediaDefault, setSupportMediaDefault] = useState(supportMediaWithoutSupportDefault);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        if (showPatientLabel && showSupportDefaults) {
          setError('Форма содержит несовместимые области настроек');
          return;
        }
        let response: Response;
        if (showPatientLabel) {
          response = await fetch(settingsEndpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'patient_label', value: { value: label } }),
          });
        } else {
          response = await fetch(settingsEndpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: [
                {
                  key: 'doctor_patient_support_comments_without_support_default_enabled',
                  value: { value: supportCommentsDefault },
                },
                {
                  key: 'doctor_patient_support_media_without_support_default_enabled',
                  value: { value: supportMediaDefault },
                },
              ],
            }),
          });
        }
        const body = (await response.json().catch(() => null)) as {
          ok?: boolean;
          settings?: Array<{ key: string; valueJson: unknown }>;
        } | null;
        if (!response.ok || !body?.ok) {
          setError('Не удалось сохранить настройки');
          return;
        }
        if (showSupportDefaults) {
          const valueFor = (key: string) => {
            const valueJson = body.settings?.find((setting) => setting.key === key)?.valueJson;
            return valueJson !== null && typeof valueJson === 'object' && 'value' in valueJson
              ? (valueJson as { value: unknown }).value
              : undefined;
          };
          if (
            valueFor('doctor_patient_support_comments_without_support_default_enabled') !==
              supportCommentsDefault ||
            valueFor('doctor_patient_support_media_without_support_default_enabled') !==
              supportMediaDefault
          ) {
            setError('Не удалось подтвердить сохранённые настройки');
            return;
          }
        }
        setSaved(true);
      } catch {
        setError('Ошибка при сохранении');
      }
    });
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Настройки кабинета</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="flex flex-col gap-4">
        {showPatientLabel ? (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="patient-label-select">
              Как называть клиента: Клиент / Пациент
            </label>
            <Select
              value={label}
              onValueChange={(v) => {
                if (v) setLabel(v);
              }}
            >
              <SelectTrigger
                id="patient-label-select"
                className="w-40"
                displayLabel={label === 'клиент' ? 'Клиент' : 'Пациент'}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="пациент">Пациент</SelectItem>
                <SelectItem value="клиент">Клиент</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {showSupportDefaults ? (
          <LabeledSwitch
            label="Комментарии без сопровождения"
            checked={supportCommentsDefault}
            onCheckedChange={setSupportCommentsDefault}
            disabled={isPending}
          />
        ) : null}

        {showSupportDefaults ? (
          <LabeledSwitch
            label="Медиа без сопровождения"
            checked={supportMediaDefault}
            onCheckedChange={setSupportMediaDefault}
            disabled={isPending}
          />
        ) : null}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Сохранение...' : 'Сохранить'}
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </div>
    </DoctorSection>
  );
}
