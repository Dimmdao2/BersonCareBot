"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookingCategoryGrid } from "./BookingCategoryGrid";
import { BookingCalendar } from "./BookingCalendar";
import { BookingSlotList } from "./BookingSlotList";
import { BookingConfirmationForm } from "./BookingConfirmationForm";
import { useBookingSelection } from "./useBookingSelection";
import { useBookingSlots } from "./useBookingSlots";
import { useMobileViewport } from "./useMobileViewport";
import type { BookingSlot } from "@/modules/patient-booking/types";

type Props = {
  defaultName: string;
  defaultPhone: string;
};

export function CabinetBookingEntry({ defaultName, defaultPhone }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const isMobile = useMobileViewport();
  const router = useRouter();
  const selectionState = useBookingSelection();

  const slotsState = useBookingSlots(selectionState.selection);
  const effectiveDate = selectedDate ?? slotsState.availableDates[0] ?? null;

  const headerLabel = useMemo(() => {
    const selection = selectionState.selection;
    if (!selection) return "Сначала выберите формат и категорию";
    const type = selection.type === "online" ? "Онлайн" : "Очный";
    const city = selection.city ? `, ${selection.city === "moscow" ? "Москва" : selection.city === "spb" ? "СПб" : selection.city}` : "";
    return `${type}${city}`;
  }, [selectionState.selection]);

  const bookingBody = (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{headerLabel}</p>

      <BookingCategoryGrid
        selection={selectionState.selection}
        onSelectInPerson={(city) => {
          selectionState.selectInPerson(city);
          setSelectedDate(null);
          setSelectedSlot(null);
        }}
        onSelectOnline={(category) => {
          selectionState.selectOnline(category);
          setSelectedDate(null);
          setSelectedSlot(null);
        }}
      />

      {selectionState.selection ? (
        <BookingCalendar
          availableDates={slotsState.availableDates}
          selectedDate={effectiveDate}
          onSelectDate={(date) => {
            setSelectedDate(date);
            setSelectedSlot(null);
          }}
        />
      ) : null}

      {slotsState.loading ? <p className="text-sm text-muted-foreground">Загрузка слотов...</p> : null}
      {slotsState.error ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-destructive">{slotsState.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void slotsState.reload()}>
            Повторить
          </Button>
        </div>
      ) : null}

      {selectionState.selection && effectiveDate ? (
        <BookingSlotList
          slots={slotsState.slotsForDate(effectiveDate)}
          selectedSlot={selectedSlot}
          onSelectSlot={setSelectedSlot}
        />
      ) : null}

      {selectionState.selection ? (
        <BookingConfirmationForm
          selection={selectionState.selection}
          selectedSlot={selectedSlot}
          defaultName={defaultName}
          defaultPhone={defaultPhone}
          onSuccess={() => {
            setOpen(false);
            selectionState.clear();
            setSelectedDate(null);
            setSelectedSlot(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Новая запись</CardTitle>
          <Badge variant="outline">Native booking</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button type="button" className="w-full" onClick={() => setOpen(true)}>
          Записаться на приём
        </Button>

        {isMobile ? (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="bottom" className="max-h-[92vh] overflow-auto">
              <SheetHeader>
                <SheetTitle>Запись на приём</SheetTitle>
              </SheetHeader>
              <div className="mt-3">{bookingBody}</div>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Запись на приём</DialogTitle>
              </DialogHeader>
              {bookingBody}
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}
