'use client';

import { useId, useMemo, useState } from 'react';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';

export type BookingLinkOption = { id: string; title: string };

type Props = {
  bookingUrl: string;
  branches: BookingLinkOption[];
  specialists: BookingLinkOption[];
};

/**
 * Конструктор ссылки на запись (план §6.5). Владелец 19.08: «надо бы сделать нормальный
 * конструктор ссылки — чтобы можно было подставить филиал или специалиста ... а можно убрать все
 * и получить первый экран с выбором филиала».
 *
 * Ровно это: два выпадающих списка, готовая ссылка, кнопка «Скопировать». Ни превью, ни QR, ни
 * UTM — их владелец не просил, а каждая добавленная ручка стала бы поверхностью, которую потом
 * сопровождать.
 */
export function ClinicBookingLinkSection({ bookingUrl, branches, specialists }: Props) {
  const branchId = useId();
  const specialistId = useId();
  const [branch, setBranch] = useState('');
  const [specialist, setSpecialist] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const link = useMemo(() => {
    const query = new URLSearchParams();
    if (branch) query.set('branch', branch);
    if (specialist) query.set('specialist', specialist);
    const suffix = query.toString();
    return suffix ? `${bookingUrl}?${suffix}` : bookingUrl;
  }, [bookingUrl, branch, specialist]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setCopyStatus('failed');
    }
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Ссылка на запись</DoctorSectionTitle>
      </DoctorSectionHeader>

      <div className="flex flex-col gap-4">
        <DoctorField label="Филиал" htmlFor={branchId} hint="Не выбран — человек выберет сам.">
          <select
            id={branchId}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={branch}
            onChange={(event) => setBranch(event.currentTarget.value)}
          >
            <option value="">Любой</option>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </DoctorField>

        <DoctorField label="Специалист" htmlFor={specialistId}>
          <select
            id={specialistId}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={specialist}
            onChange={(event) => setSpecialist(event.currentTarget.value)}
          >
            <option value="">Любой</option>
            {specialists.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </DoctorField>

        <div className="flex flex-wrap items-center gap-2">
          <Input readOnly value={link} className="min-w-0 flex-1 font-mono text-xs" />
          <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
            {copyStatus === 'copied' ? 'Скопировано' : 'Скопировать'}
          </Button>
        </div>
        {copyStatus === 'failed' ? (
          <p role="alert" className="text-sm text-destructive">
            Не удалось скопировать ссылку.
          </p>
        ) : null}
      </div>
    </DoctorSection>
  );
}
