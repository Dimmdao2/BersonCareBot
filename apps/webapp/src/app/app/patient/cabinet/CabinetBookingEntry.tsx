"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookingFormatGrid } from "./BookingFormatGrid";
import { BookingCalendar } from "./BookingCalendar";
import { BookingSlotList } from "./BookingSlotList";
import { BookingConfirmationForm } from "./BookingConfirmationForm";
import { useBookingSelection } from "./useBookingSelection";
import { useBookingSlots } from "./useBookingSlots";
import { useBookingCatalogCities, useBookingCatalogServices } from "./useBookingCatalog";
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

  const catalogCities = useBookingCatalogCities(open);
  const catalogServices = useBookingCatalogServices(
    selectionState.inPersonDraft?.cityCode ?? null,
    open && Boolean(selectionState.inPersonDraft),
  );

  const slotsState = useBookingSlots(selectionState.selection);
  const effectiveDate = selectedDate ?? slotsState.availableDates[0] ?? null;

  const headerLabel = useMemo(() => {
    const sel = selectionState.selection;
    if (!sel) {
      if (selectionState.inPersonMode && !selectionState.inPersonDraft) return "Очный приём: выберите город";
      if (selectionState.inPersonDraft) return `Очный приём: ${selectionState.inPersonDraft.cityTitle} — выберите услугу`;
      return "Сначала выберите формат приёма";
    }
    if (sel.type === "online") {
      const cat =
        sel.category === "rehab_lfk" ? "Онлайн, ЛФК" : sel.category === "nutrition" ? "Онлайн, нутрициология" : "Онлайн";
      return cat;
    }
    return `Очный: ${sel.cityTitle} · ${sel.serviceTitle}`;
  }, [selectionState.selection, selectionState.inPersonMode, selectionState.inPersonDraft]);

  const bookingBody = (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{headerLabel}</p>

      <BookingFormatGrid
        selection={selectionState.selection}
        inPersonMode={selectionState.inPersonMode}
        onStartInPerson={() => {
          selectionState.startInPerson();
          setSelectedDate(null);
          setSelectedSlot(null);
        }}
        onSelectOnline={(category) => {
          selectionState.selectOnline(category);
          setSelectedDate(null);
          setSelectedSlot(null);
        }}
      />

      {selectionState.inPersonMode && !selectionState.inPersonDraft && !selectionState.selection ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Город</h3>
            <Badge variant="outline">Шаг 2</Badge>
          </div>
          {catalogCities.loading ? <p className="text-sm text-muted-foreground">Загрузка городов…</p> : null}
          {catalogCities.error ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-destructive">{catalogCities.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void catalogCities.reload()}>
                Повторить
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {catalogCities.cities.map((c) => (
              <Button
                key={c.id}
                type="button"
                variant={
                  selectionState.inPersonDraft?.cityCode === c.code ? "default" : "outline"
                }
                size="sm"
                onClick={() => {
                  selectionState.selectInPersonCity(c.code, c.title);
                  setSelectedDate(null);
                  setSelectedSlot(null);
                }}
              >
                {c.title}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {selectionState.inPersonDraft && !selectionState.selection ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Услуга</h3>
            <Badge variant="outline">Шаг 3</Badge>
          </div>
          {catalogServices.loading ? <p className="text-sm text-muted-foreground">Загрузка услуг…</p> : null}
          {catalogServices.error ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-destructive">{catalogServices.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void catalogServices.reload()}>
                Повторить
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            {catalogServices.services.map((s) => {
              const title = s.service?.title ?? "Услуга";
              const dur = s.service?.durationMinutes;
              const label = dur != null ? `${title} (${dur} мин.)` : title;
              return (
                <Button
                  key={s.id}
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 justify-start whitespace-normal text-left"
                  onClick={() => {
                    selectionState.selectInPersonService(s.id, title);
                    setSelectedDate(null);
                    setSelectedSlot(null);
                  }}
                >
                  {label}
                </Button>
              );
            })}
          </div>
          {catalogServices.services.length === 0 && !catalogServices.loading && !catalogServices.error ? (
            <p className="text-sm text-muted-foreground">Нет доступных услуг в этом городе.</p>
          ) : null}
        </div>
      ) : null}

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

      {selectionState.selection ? (
        slotsState.loading ? <p className="text-sm text-muted-foreground">Загрузка слотов...</p> : null
      ) : null}
      {selectionState.selection && slotsState.error ? (
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
