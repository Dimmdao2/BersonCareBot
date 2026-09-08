'use client';

import { useState } from 'react';
import { Badge } from '@/shared/ui/patient/primitives/badge';
import { Button } from '@/shared/ui/patient/primitives/button';
import { Input } from '@/shared/ui/patient/primitives/input';
import type { BookingSelection } from './useBookingSelection';
import type { BookingSlot } from '@/modules/patient-booking/types';
import { useCreateBooking } from './useCreateBooking';
import { cn } from '@/lib/utils';
import { patientCaptionTextClass, patientMutedTextClass, patientSectionTitleClass } from '@/shared/ui/patient/patientVisual';

type Props = {
  selection: BookingSelection | null;
  selectedSlot: BookingSlot | null;
  defaultName: string;
  defaultPhone: string;
  onSuccess: () => void;
};

export function BookingConfirmationForm({
  selection,
  selectedSlot,
  defaultName,
  defaultPhone,
  onSuccess,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [email, setEmail] = useState('');
  const { submitting, error, createBooking } = useCreateBooking();

  const canSubmit = Boolean(
    selection && selectedSlot && name.trim() && phone.trim() && !submitting,
  );

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selection || !selectedSlot) return;
        void createBooking({
          selection,
          slot: selectedSlot,
          contactName: name.trim(),
          contactPhone: phone.trim(),
          contactEmail: email.trim() || undefined,
        }).then((ok) => {
          if (ok) onSuccess();
        });
      }}
    >
      <div className="flex items-center gap-2">
        <h3 className={patientSectionTitleClass}>Подтверждение записи</h3>
        <Badge variant="outline">Шаг 5</Badge>
      </div>

      <label className="flex flex-col gap-1">
        <span className={patientCaptionTextClass}>Имя</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className={patientCaptionTextClass}>Телефон</span>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className={patientCaptionTextClass}>Email (опционально)</span>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {error ? <p className={cn(patientMutedTextClass, 'patient-text-danger')}>{error}</p> : null}
      <Button type="submit" disabled={!canSubmit}>
        {submitting ? 'Создаём запись...' : 'Подтвердить запись'}
      </Button>
    </form>
  );
}
