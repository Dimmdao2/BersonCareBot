"use client";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type LabeledSwitchProps = {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  /** Доп. классы для `Switch` (например `data-checked:bg-destructive`). */
  switchClassName?: string;
};

export function LabeledSwitch({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  switchClassName,
}: LabeledSwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(switchClassName)}
      />
    </div>
  );
}
