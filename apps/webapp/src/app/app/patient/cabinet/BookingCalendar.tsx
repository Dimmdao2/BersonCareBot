"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  availableDates: string[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
};

function formatDateLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
  });
}

export function BookingCalendar({ availableDates, selectedDate, onSelectDate }: Props) {
  if (availableDates.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Выбор даты</h3>
          <Badge variant="outline">Шаг 4</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Нет доступных дат для выбранного формата.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Выбор даты</h3>
        <Badge variant="outline">Шаг 4</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {availableDates.map((date) => (
          <Button
            key={date}
            type="button"
            variant={date === selectedDate ? "default" : "outline"}
            size="sm"
            onClick={() => onSelectDate(date)}
          >
            {formatDateLabel(date)}
          </Button>
        ))}
      </div>
    </div>
  );
}
