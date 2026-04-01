"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BookingSlot } from "@/modules/patient-booking/types";

type Props = {
  slots: BookingSlot[];
  selectedSlot: BookingSlot | null;
  onSelectSlot: (slot: BookingSlot) => void;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function BookingSlotList({ slots, selectedSlot, onSelectSlot }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Выбор времени</h3>
        <Badge variant="outline">Шаг 4</Badge>
      </div>
      {slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">На выбранную дату слоты не найдены.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => {
            const isActive = selectedSlot?.startAt === slot.startAt && selectedSlot?.endAt === slot.endAt;
            return (
              <Button
                key={`${slot.startAt}-${slot.endAt}`}
                type="button"
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => onSelectSlot(slot)}
              >
                {formatTime(slot.startAt)} - {formatTime(slot.endAt)}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
