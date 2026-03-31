"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BookingSelection } from "./useBookingSelection";

type Props = {
  selection: BookingSelection | null;
  onSelectInPerson: (city: "moscow" | "spb") => void;
  onSelectOnline: (category: "rehab_lfk" | "nutrition") => void;
};

function isSelected(selection: BookingSelection | null, params: { type: "in_person"; city: "moscow" | "spb" } | { type: "online"; category: "rehab_lfk" | "nutrition" }): boolean {
  if (!selection) return false;
  if (params.type === "in_person") {
    return selection.type === "in_person" && selection.city === params.city;
  }
  return selection.type === "online" && selection.category === params.category;
}

export function BookingCategoryGrid({ selection, onSelectInPerson, onSelectOnline }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Выберите формат приёма</h3>
        <Badge variant="outline">Шаг 1</Badge>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant={isSelected(selection, { type: "in_person", city: "moscow" }) ? "default" : "outline"}
          className="h-auto min-h-14 justify-start text-left"
          onClick={() => onSelectInPerson("moscow")}
        >
          Очный приём - Москва
        </Button>
        <Button
          type="button"
          variant={isSelected(selection, { type: "in_person", city: "spb" }) ? "default" : "outline"}
          className="h-auto min-h-14 justify-start text-left"
          onClick={() => onSelectInPerson("spb")}
        >
          Очный приём - СПб
        </Button>
        <Button
          type="button"
          variant={isSelected(selection, { type: "online", category: "rehab_lfk" }) ? "default" : "outline"}
          className="h-auto min-h-14 justify-start text-left"
          onClick={() => onSelectOnline("rehab_lfk")}
        >
          Онлайн - Реабилитация (ЛФК)
        </Button>
        <Button
          type="button"
          variant={isSelected(selection, { type: "online", category: "nutrition" }) ? "default" : "outline"}
          className="h-auto min-h-14 justify-start text-left"
          onClick={() => onSelectOnline("nutrition")}
        >
          Онлайн - Нутрициология
        </Button>
      </div>
    </div>
  );
}
