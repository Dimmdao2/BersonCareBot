'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import { apiJson } from '@/shared/lib/apiJson';
import {
  MAX_APPOINTMENT_REMINDERS,
  parseAppointmentReminderOffsets,
  type AppointmentReminderSettings,
} from '@/modules/booking-notifications/appointmentReminderSchedule';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/shared/ui/doctor/primitives/select';
import { notificationText } from '@/shared/notifications/notificationText';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

type PeriodUnit = 'minutes' | 'hours' | 'days';
type PeriodDraft = { id: number; amount: string; unit: PeriodUnit };

const UNIT_OPTIONS: ReadonlyArray<{ value: PeriodUnit; label: string; multiplier: number }> = [
  { value: 'minutes', label: 'минут', multiplier: 1 },
  { value: 'hours', label: 'часов', multiplier: 60 },
  { value: 'days', label: 'дней', multiplier: 24 * 60 },
];

function draftFromOffset(id: number, offsetMinutes: number): PeriodDraft {
  if (offsetMinutes % (24 * 60) === 0) {
    return { id, amount: String(offsetMinutes / (24 * 60)), unit: 'days' };
  }
  if (offsetMinutes % 60 === 0) {
    return { id, amount: String(offsetMinutes / 60), unit: 'hours' };
  }
  return { id, amount: String(offsetMinutes), unit: 'minutes' };
}

function offsetFromDraft(draft: PeriodDraft): number | null {
  const amount = Number(draft.amount);
  const unit = UNIT_OPTIONS.find((option) => option.value === draft.unit);
  if (!unit || !Number.isSafeInteger(amount) || amount <= 0) return null;
  const offset = amount * unit.multiplier;
  return Number.isSafeInteger(offset) ? offset : null;
}

export function AppointmentReminderSettingsSection({
  initialSettings,
}: {
  initialSettings: AppointmentReminderSettings;
}) {
  const { appointmentPrepositionalPlural } = useDoctorPatientTerms();
  const nextId = useRef(initialSettings.offsetsMinutes.length);
  const [drafts, setDrafts] = useState(() =>
    initialSettings.offsetsMinutes.map((offset, index) => draftFromOffset(index, offset)),
  );
  const [pending, startTransition] = useTransition();
  const offsetsMinutes = useMemo(() => {
    const values = drafts.map(offsetFromDraft);
    if (values.some((value) => value === null)) return null;
    return parseAppointmentReminderOffsets(values as number[]);
  }, [drafts]);

  const save = () => {
    if (!offsetsMinutes) return;
    startTransition(async () => {
      try {
        const response = (await apiJson('/api/doctor/appointment-reminders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offsetsMinutes }),
        })) as { settings: AppointmentReminderSettings };
        setDrafts(
          response.settings.offsetsMinutes.map((offset, index) =>
            draftFromOffset(nextId.current + index, offset),
          ),
        );
        nextId.current += response.settings.offsetsMinutes.length;
        toast.success(notificationText.commonSaved);
      } catch {
        toast.error(notificationText.settingsReminderSettingsSaveFailed);
      }
    });
  };

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Напоминания о {appointmentPrepositionalPlural}</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="flex flex-col gap-3">
        {drafts.map((draft, index) => {
          const unit = UNIT_OPTIONS.find((option) => option.value === draft.unit)!;
          return (
            <div key={draft.id} className="flex flex-wrap items-end gap-2">
              <DoctorField
                label={`Напоминание ${index + 1}`}
                htmlFor={`appointment-reminder-${draft.id}`}
                className="min-w-28 flex-1"
              >
                <Input
                  id={`appointment-reminder-${draft.id}`}
                  type="number"
                  min={1}
                  step={1}
                  value={draft.amount}
                  disabled={pending}
                  onChange={(event) => {
                    const amount = event.target.value;
                    setDrafts((current) =>
                      current.map((item) => (item.id === draft.id ? { ...item, amount } : item)),
                    );
                  }}
                />
              </DoctorField>
              <DoctorField label="Период" className="min-w-32 flex-1">
                <Select
                  value={draft.unit}
                  disabled={pending}
                  onValueChange={(value) => {
                    if (!UNIT_OPTIONS.some((option) => option.value === value)) return;
                    setDrafts((current) =>
                      current.map((item) =>
                        item.id === draft.id ? { ...item, unit: value as PeriodUnit } : item,
                      ),
                    );
                  }}
                >
                  <SelectTrigger displayLabel={unit.label} />
                  <SelectContent>
                    {UNIT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DoctorField>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  setDrafts((current) => current.filter((item) => item.id !== draft.id))
                }
              >
                Удалить
              </Button>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || drafts.length >= MAX_APPOINTMENT_REMINDERS}
            onClick={() => {
              const id = nextId.current++;
              setDrafts((current) => [...current, { id, amount: '1', unit: 'hours' }]);
            }}
          >
            Добавить напоминание
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || offsetsMinutes === null}
            onClick={save}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </DoctorSection>
  );
}
