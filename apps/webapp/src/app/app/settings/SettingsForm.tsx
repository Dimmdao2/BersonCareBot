"use client";

import { useState, useTransition } from "react";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/doctor/primitives/select";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";

type SettingsFormProps = {
  patientLabel: string;
  smsFallbackEnabled: boolean;
  supportCommentsWithoutSupportDefault: boolean;
  supportMediaWithoutSupportDefault: boolean;
  settingsEndpoint?: "/api/doctor/settings" | "/api/admin/settings";
  showSmsFallback?: boolean;
  showPatientLabel?: boolean;
  showSupportDefaults?: boolean;
};

export function SettingsForm({
  patientLabel,
  smsFallbackEnabled,
  supportCommentsWithoutSupportDefault,
  supportMediaWithoutSupportDefault,
  settingsEndpoint = "/api/doctor/settings",
  showSmsFallback = true,
  showPatientLabel = true,
  showSupportDefaults = true,
}: SettingsFormProps) {
  const [label, setLabel] = useState(patientLabel);
  const [smsFallback, setSmsFallback] = useState(smsFallbackEnabled);
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
        const requests: Promise<Response>[] = [];
        if (showPatientLabel) {
          requests.push(fetch(settingsEndpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: "patient_label", value: { value: label } }),
          }));
        }
        if (showSupportDefaults) {
          requests.push(fetch(settingsEndpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: "doctor_patient_support_comments_without_support_default_enabled",
              value: { value: supportCommentsDefault },
            }),
          }));
          requests.push(fetch(settingsEndpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: "doctor_patient_support_media_without_support_default_enabled",
              value: { value: supportMediaDefault },
            }),
          }));
        }
        if (showSmsFallback) {
          requests.push(
            fetch(settingsEndpoint, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key: "sms_fallback_enabled", value: { value: smsFallback } }),
            }),
          );
        }
        const responses = await Promise.all(requests);
        if (responses.some((response) => !response.ok)) {
          setError("Не удалось сохранить настройки");
          return;
        }
        setSaved(true);
      } catch {
        setError("Ошибка при сохранении");
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
              <SelectTrigger id="patient-label-select" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="пациент">Пациент</SelectItem>
                <SelectItem value="клиент">Клиент</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {showSmsFallback ? (
          <LabeledSwitch
            label="SMS fallback"
            hint="Разрешить SMS для OTP и записи на приём; если выключено — только Telegram / Max / email."
            checked={smsFallback}
            onCheckedChange={setSmsFallback}
            disabled={isPending}
          />
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
            {isPending ? "Сохранение..." : "Сохранить"}
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </div>
    </DoctorSection>
  );
}
