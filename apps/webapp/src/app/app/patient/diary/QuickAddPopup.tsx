'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/shared/ui/patient/primitives/button';
import { NumericChipGroup } from '@/components/common/controls/NumericChipGroup';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/patient/primitives/select';
import { PatientModal } from '@/shared/ui/patient/PatientModal';
import { PatientConfirmModal } from '@/shared/ui/patient/PatientConfirmModal';
import { addSymptomEntry } from './symptoms/actions';
import { notifyDiarySymptomEntrySaved } from '@/modules/diaries/symptomDiaryClientEvents';
import {
  shouldConfirmInstantDuplicate,
  type LastSymptomSaveMeta,
} from './symptoms/symptomEntryDedup';
import { markLfkSession } from './lfk/actions';
import {
  patientCaptionTextClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';

type Props = {
  trackings: { id: string; title: string }[];
  complexes: { id: string; title: string }[];
};

/** Кнопка «+» и модалка быстрого добавления записи симптома или отметки ЛФК. */
export function QuickAddPopup({ trackings, complexes }: Props) {
  const [open, setOpen] = useState(false);
  const [symValue, setSymValue] = useState<number | null>(5);
  const [symPending, startSymTransition] = useTransition();
  const [lfkPending, startLfkTransition] = useTransition();
  const lastSavedRef = useRef<LastSymptomSaveMeta | null>(null);
  const [pickedSymTrackingId, setPickedSymTrackingId] = useState<string | null>(null);
  const [pickedLfkComplexId, setPickedLfkComplexId] = useState<string | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<{
    trackingId: string;
    value: number;
  } | null>(null);

  const symTrackingId = useMemo(() => {
    if (trackings.length === 0) return '';
    if (trackings.length === 1) return trackings[0]!.id;
    if (pickedSymTrackingId && trackings.some((t) => t.id === pickedSymTrackingId))
      return pickedSymTrackingId;
    return trackings[0]!.id;
  }, [trackings, pickedSymTrackingId]);

  const lfkComplexId = useMemo(() => {
    if (complexes.length === 0) return '';
    if (complexes.length === 1) return complexes[0]!.id;
    if (pickedLfkComplexId && complexes.some((c) => c.id === pickedLfkComplexId))
      return pickedLfkComplexId;
    return complexes[0]!.id;
  }, [complexes, pickedLfkComplexId]);

  const quickAddSymptomTrackingSelectItems = useMemo(
    () => Object.fromEntries(trackings.map((t) => [t.id, t.title])),
    [trackings],
  );
  const quickAddLfkComplexSelectItems = useMemo(
    () => Object.fromEntries(complexes.map((c) => [c.id, c.title])),
    [complexes],
  );

  const saveSymptomEntry = (trackingId: string, value: number) => {
    const formData = new FormData();
    formData.set('trackingId', trackingId);
    formData.set('value', String(value));
    formData.set('entryType', 'instant');
    startSymTransition(async () => {
      const result = await addSymptomEntry(formData);
      if (result.ok) {
        toast.success('Запись сохранена');
        lastSavedRef.current = { trackingId, entryType: 'instant', at: Date.now() };
        notifyDiarySymptomEntrySaved();
        setPendingDuplicate(null);
        setOpen(false);
      } else {
        toast.error(result.message ?? 'Не удалось сохранить');
      }
    });
  };

  if (trackings.length === 0 && complexes.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        size="icon-lg"
        variant="default"
        className="safe-fab-br h-14 w-14 rounded-full shadow-lg"
        aria-label="Быстрое добавление"
        onClick={() => setOpen(true)}
      >
        <PlusIcon className="size-6" />
      </Button>
      <PatientModal
        open={open}
        onClose={() => {
          setPendingDuplicate(null);
          setOpen(false);
        }}
        title="Быстрое добавление"
        size="md"
      >
        <div className="flex flex-col gap-6">
          {trackings.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className={patientSectionTitleClass}>Симптом</h3>
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const trackingId = String(fd.get('trackingId') ?? '').trim();
                  if (!trackingId || symValue === null) {
                    toast.error('Выберите симптом и значение');
                    return;
                  }
                  if (shouldConfirmInstantDuplicate(lastSavedRef.current, trackingId, 'instant')) {
                    setPendingDuplicate({ trackingId, value: symValue });
                    return;
                  }
                  saveSymptomEntry(trackingId, symValue);
                }}
              >
                {trackings.length === 1 ? (
                  <input type="hidden" name="trackingId" value={trackings[0].id} />
                ) : (
                  <>
                    <input type="hidden" name="trackingId" value={symTrackingId} />
                    <Select
                      value={symTrackingId}
                      onValueChange={(v) => v != null && setPickedSymTrackingId(v)}
                      items={quickAddSymptomTrackingSelectItems}
                    >
                      <SelectTrigger variant="journal" className="min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {trackings.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                <NumericChipGroup
                  min={0}
                  max={10}
                  value={symValue}
                  onChange={setSymValue}
                  chipClassName={cn('size-8', patientCaptionTextClass)}
                />
                <input
                  type="hidden"
                  name="value"
                  value={symValue !== null ? String(symValue) : ''}
                />
                <input type="hidden" name="entryType" value="instant" />
                <Button
                  type="submit"
                  variant="patient-primary"
                  disabled={symValue === null || symPending}
                >
                  {symPending ? 'Сохраняю…' : 'Сохранить симптом'}
                </Button>
              </form>
            </section>
          ) : null}

          {complexes.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className={patientSectionTitleClass}>ЛФК</h3>
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  startLfkTransition(async () => {
                    const result = await markLfkSession(fd);
                    if (result.ok) {
                      toast.success('Занятие отмечено');
                      setOpen(false);
                    } else {
                      toast.error(result.message ?? 'Не удалось отметить занятие');
                    }
                  });
                }}
              >
                {complexes.length === 1 ? (
                  <input type="hidden" name="complexId" value={complexes[0].id} />
                ) : (
                  <>
                    <input type="hidden" name="complexId" value={lfkComplexId} />
                    <Select
                      value={lfkComplexId}
                      onValueChange={(v) => v != null && setPickedLfkComplexId(v)}
                      items={quickAddLfkComplexSelectItems}
                    >
                      <SelectTrigger variant="journal" className="min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {complexes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                <Button type="submit" variant="patient-primary" disabled={lfkPending}>
                  {lfkPending ? 'Сохраняю…' : 'Выполнено'}
                </Button>
              </form>
            </section>
          ) : null}
        </div>
      </PatientModal>
      <PatientConfirmModal
        open={pendingDuplicate !== null}
        onClose={() => setPendingDuplicate(null)}
        onConfirm={() => {
          if (pendingDuplicate) {
            saveSymptomEntry(pendingDuplicate.trackingId, pendingDuplicate.value);
          }
        }}
        title="Повторная запись"
        confirmLabel="Сохранить ещё одну"
        pending={symPending}
        nested
      >
        Вы только что сделали такую запись. Сохранить ещё одну?
      </PatientConfirmModal>
    </>
  );
}
