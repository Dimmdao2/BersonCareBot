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
};

export function SettingsForm({
  patientLabel,
  smsFallbackEnabled,
  supportCommentsWithoutSupportDefault,
  supportMediaWithoutSupportDefault,
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
        const [r1, r2, r3, r4] = await Promise.all([
          fetch("/api/doctor/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: "patient_label", value: { value: label } }),
          }),
          fetch("/api/doctor/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: "sms_fallback_enabled", value: { value: smsFallback } }),
          }),
          fetch("/api/doctor/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: "doctor_patient_support_comments_without_support_default_enabled",
              value: { value: supportCommentsDefault },
            }),
          }),
          fetch("/api/doctor/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: "doctor_patient_support_media_without_support_default_enabled",
              value: { value: supportMediaDefault },
            }),
          }),
        ]);
        if (!r1.ok || !r2.ok || !r3.ok || !r4.ok) {
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
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="patient-label-select">
            Как называть пациента
          </label>
          <Select value={label} onValueChange={(v) => { if (v) setLabel(v); }}>
            <SelectTrigger id="patient-label-select" className="w-40">
              {/* SelectItem values are already human-readable Russian */}
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="пациент">Пациент</SelectItem>
              <SelectItem value="клиент">Клиент</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Используется в интерфейсе кабинета
          </p>
        </div>

        <LabeledSwitch
          label="SMS fallback"
          hint="Разрешить SMS для OTP и записи на приём; если выключено — только Telegram / Max / email."
          checked={smsFallback}
          onCheckedChange={setSmsFallback}
          disabled={isPending}
        />

        <LabeledSwitch
          label="Комментарии без сопровождения"
          checked={supportCommentsDefault}
          onCheckedChange={setSupportCommentsDefault}
          disabled={isPending}
        />

        <LabeledSwitch
          label="Медиа без сопровождения"
          checked={supportMediaDefault}
          onCheckedChange={setSupportMediaDefault}
          disabled={isPending}
        />

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
