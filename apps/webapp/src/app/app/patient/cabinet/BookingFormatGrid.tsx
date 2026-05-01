"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { patientSectionTitleClass } from "@/shared/ui/patientVisual";
import type { BookingSelection } from "./useBookingSelection";

type Props = {
  selection: BookingSelection | null;
  inPersonMode: boolean;
  onStartInPerson: () => void;
  onSelectOnline: (category: "rehab_lfk" | "nutrition") => void;
};

export function BookingFormatGrid({ selection, inPersonMode, onStartInPerson, onSelectOnline }: Props) {
  const inPersonChosen = inPersonMode || selection?.type === "in_person";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className={cn(patientSectionTitleClass, "text-sm")}>Формат приёма</h3>
        <Badge variant="outline">Шаг 1</Badge>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant={inPersonChosen ? "default" : "outline"}
          className="h-auto min-h-14 justify-start text-left"
          onClick={() => onStartInPerson()}
        >
          <span className={cn("text-sm font-semibold", inPersonChosen ? "text-white" : "text-[var(--patient-text-primary)]")}>Очный приём</span>
        </Button>
        <Button
          type="button"
          variant={selection?.type === "online" && selection.category === "rehab_lfk" ? "default" : "outline"}
          className="h-auto min-h-14 justify-start text-left"
          onClick={() => onSelectOnline("rehab_lfk")}
        >
          <span
            className={cn(
              "text-sm font-semibold",
              selection?.type === "online" && selection.category === "rehab_lfk" ? "text-white" : "text-[var(--patient-text-primary)]",
            )}
          >
            Онлайн - Реабилитация (ЛФК)
          </span>
        </Button>
        <Button
          type="button"
          variant={selection?.type === "online" && selection.category === "nutrition" ? "default" : "outline"}
          className="h-auto min-h-14 justify-start text-left"
          onClick={() => onSelectOnline("nutrition")}
        >
          <span
            className={cn(
              "text-sm font-semibold",
              selection?.type === "online" && selection.category === "nutrition" ? "text-white" : "text-[var(--patient-text-primary)]",
            )}
          >
            Онлайн - Нутрициология
          </span>
        </Button>
      </div>
    </div>
  );
}
