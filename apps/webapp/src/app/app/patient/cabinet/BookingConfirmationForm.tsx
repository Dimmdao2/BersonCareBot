"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BookingSelection } from "./useBookingSelection";
import type { BookingSlot } from "@/modules/patient-booking/types";
import { useCreateBooking } from "./useCreateBooking";

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
  const [email, setEmail] = useState("");
  const { submitting, error, createBooking } = useCreateBooking();

  const canSubmit = Boolean(selection && selectedSlot && name.trim() && phone.trim() && !submitting);

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
        <h3 className="text-sm font-semibold">Подтверждение записи</h3>
        <Badge variant="outline">Шаг 5</Badge>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Имя</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Телефон</span>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Email (опционально)</span>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={!canSubmit}>
        {submitting ? "Создаём запись..." : "Подтвердить запись"}
      </Button>
    </form>
  );
}
