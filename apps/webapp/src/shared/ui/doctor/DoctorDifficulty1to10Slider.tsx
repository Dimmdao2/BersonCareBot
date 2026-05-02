"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  doctorDifficulty1to10ClampedInt,
  doctorDifficulty1to10EndpointLabelColor,
  doctorDifficulty1to10RangeStyle,
} from "./doctorDifficulty1to10";

export type DoctorDifficulty1to10SliderProps = {
  id: string;
  name: string;
  value: number;
  onChange: (next: number) => void;
  /** Текст до числа (например «Сложность:»); значение идёт сразу после, в той же строке. */
  label: ReactNode;
  className?: string;
};

/**
 * Общая шкала сложности 1–10 для кабинета врача (упражнения и др.).
 * Вёрстка: текст label и значение в одной строке; ниже ползунок с метками 1 и 10.
 */
export function DoctorDifficulty1to10Slider({
  id,
  name,
  value,
  onChange,
  label,
  className,
}: DoctorDifficulty1to10SliderProps) {
  const clamped = doctorDifficulty1to10ClampedInt(value);
  const rangeStyle = useMemo(() => doctorDifficulty1to10RangeStyle(clamped), [clamped]);
  const colorMin = doctorDifficulty1to10EndpointLabelColor(1);
  const colorMax = doctorDifficulty1to10EndpointLabelColor(10);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id} className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-medium leading-none">
        <span>{label}</span>
        <span className="font-semibold tabular-nums tracking-tight text-foreground" aria-live="polite">
          {clamped}
        </span>
      </Label>
      <div className="flex max-w-md items-center gap-2">
        <span
          className="w-5 shrink-0 text-center text-xs font-medium tabular-nums"
          style={{ color: colorMin }}
          aria-hidden
        >
          1
        </span>
        <input
          id={id}
          name={name}
          type="range"
          min={1}
          max={10}
          value={clamped}
          onChange={(e) => onChange(Number(e.target.value))}
          className="doctor-difficulty-1to10-range touch-manipulation min-w-0 flex-1"
          style={rangeStyle}
        />
        <span
          className="w-5 shrink-0 text-center text-xs font-medium tabular-nums"
          style={{ color: colorMax }}
          aria-hidden
        >
          10
        </span>
      </div>
    </div>
  );
}
