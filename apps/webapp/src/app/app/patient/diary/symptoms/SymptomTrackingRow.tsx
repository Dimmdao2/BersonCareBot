'use client';

import { useId, useRef, useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/patient/primitives/button';
import { NumericChipGroup } from '@/components/common/controls/NumericChipGroup';
import { notifyDiarySymptomEntrySaved } from '@/modules/diaries/symptomDiaryClientEvents';
import { shouldConfirmInstantDuplicate, type LastSymptomSaveMeta } from './symptomEntryDedup';
import { addSymptomEntry } from './actions';
import { cn } from '@/lib/utils';
import { patientListItemClass, patientMutedTextClass } from '@/shared/ui/patient/patientVisual';
import { PatientModal, PatientModalFooter } from '@/shared/ui/patient/PatientModal';
import { SymptomChart } from '@/modules/diaries/components/SymptomChart';

export function SymptomTrackingRow({ id, title }: { id: string; title: string }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const lastSavedRef = useRef<LastSymptomSaveMeta | null>(null);
  const formId = `patient-symptom-entry-${useId().replace(/:/g, '')}`;

  return (
    <li id={`patient-symptoms-tracking-item-${id}`}>
      <button
        type="button"
        className={cn(
          patientListItemClass,
          'flex w-full items-center justify-between gap-3 text-left transition-colors hover:bg-[var(--patient-surface-neutral-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)]',
        )}
        onClick={() => setOpen(true)}
      >
        <strong>{title}</strong>
        <span className={patientMutedTextClass}>Отметить</span>
      </button>

      <PatientModal
        open={open}
        onClose={() => setOpen(false)}
        title="Симптом"
        titleSubject={title}
        size="lg"
      >
        {open ? (
          <div className="flex flex-col gap-6">
            <form
              id={formId}
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (selectedValue === null) {
                  toast.error('Выберите интенсивность');
                  return;
                }
                if (shouldConfirmInstantDuplicate(lastSavedRef.current, id, 'instant')) {
                  if (!window.confirm('Вы только что сделали такую запись. Сохранить ещё одну?'))
                    return;
                }
                const formData = new FormData();
                formData.set('trackingId', id);
                formData.set('value', String(selectedValue));
                formData.set('entryType', 'instant');
                startTransition(async () => {
                  const result = await addSymptomEntry(formData);
                  if (result.ok) {
                    toast.success('Запись сохранена');
                    lastSavedRef.current = { trackingId: id, entryType: 'instant', at: Date.now() };
                    setSelectedValue(null);
                    notifyDiarySymptomEntrySaved();
                  } else if (result.reason === 'duplicate_instant') {
                    toast.error('Похожая запись в моменте уже сохранена только что');
                  } else {
                    toast.error(result.message ?? 'Не удалось сохранить');
                  }
                });
              }}
            >
              <span
                className={cn(patientMutedTextClass, 'text-xs font-medium uppercase tracking-wide')}
              >
                Интенсивность (0–10)
              </span>
              <NumericChipGroup
                min={0}
                max={10}
                value={selectedValue}
                onChange={setSelectedValue}
              />
            </form>

            <SymptomChart
              trackings={[{ id, symptomTitle: title }]}
              initialPeriod="month"
              scrollable
              showJournalLink={false}
            />
          </div>
        ) : null}
        {open ? (
          <PatientModalFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Закрыть
            </Button>
            <Button type="submit" form={formId} disabled={isPending || selectedValue === null}>
              {isPending ? 'Сохраняю…' : 'Сохранить'}
            </Button>
          </PatientModalFooter>
        ) : null}
      </PatientModal>
    </li>
  );
}
