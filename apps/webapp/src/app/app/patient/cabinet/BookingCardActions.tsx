"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { useCancelBooking } from "./useCancelBooking";

type Props = {
  booking: PatientBookingRecord;
};

export function BookingCardActions({ booking }: Props) {
  const router = useRouter();
  const [openCancel, setOpenCancel] = useState(false);
  const { loading, error, cancelBooking } = useCancelBooking();

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpenCancel(true)}>
          Отменить
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled>
          Перенести
        </Button>
      </div>

      <Dialog open={openCancel} onOpenChange={setOpenCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отменить запись?</DialogTitle>
            <DialogDescription>
              Запись на {new Date(booking.slotStart).toLocaleString("ru-RU")} будет отменена.
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenCancel(false)}
              disabled={loading}
            >
              Назад
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void cancelBooking(booking.id).then((ok) => {
                  if (!ok) return;
                  setOpenCancel(false);
                  router.refresh();
                });
              }}
              disabled={loading}
            >
              {loading ? "Отменяем..." : "Подтвердить отмену"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
