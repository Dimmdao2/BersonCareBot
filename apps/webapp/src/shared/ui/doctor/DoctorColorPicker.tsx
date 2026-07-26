"use client";

import { useId } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/doctor/primitives/popover";
import { inputFieldSurfaceClassName } from "@/shared/ui/doctor/primitives/input";
import { cn } from "@/lib/utils";

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

type DoctorColorPickerProps = {
  /** Current color, in whatever hex shape the caller stores. Passed through unchanged. */
  value: string;
  /** Fires with whatever hex string react-colorful produced — this widget never reshapes it. */
  onChange: (value: string) => void;
  /** Accessible name for the swatch trigger, announced by screen readers. */
  label: string;
  id?: string;
  disabled?: boolean;
  /** Overrides the trigger swatch size/shape; defaults match the old native input footprint. */
  className?: string;
};

/**
 * Hue square + slider + HEX text field (react-colorful), swapped in for the native
 * `<input type="color">`. Callers keep owning validation/normalization of the value —
 * this widget only ever hands back exactly what the user picked or typed.
 */
export function DoctorColorPicker({
  value,
  onChange,
  label,
  id,
  disabled,
  className,
}: DoctorColorPickerProps) {
  const reactId = useId();
  const triggerId = id ?? reactId;
  const hexInputId = `${triggerId}-hex`;
  const pickerColor = HEX_COLOR_RE.test(value) ? value : "#000000";

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        id={triggerId}
        aria-label={label}
        title={value}
        disabled={disabled}
        className={cn(
          "h-8 w-12 shrink-0 cursor-pointer rounded-md border border-input transition-colors",
          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        style={{ backgroundColor: pickerColor }}
      />
      <PopoverContent className="w-auto gap-3 p-3" align="start">
        <HexColorPicker color={pickerColor} onChange={onChange} />
        <label htmlFor={hexInputId} className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>HEX</span>
          <HexColorInput
            id={hexInputId}
            color={pickerColor}
            onChange={onChange}
            prefixed
            disabled={disabled}
            className={cn(inputFieldSurfaceClassName, "h-8 font-mono")}
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}
