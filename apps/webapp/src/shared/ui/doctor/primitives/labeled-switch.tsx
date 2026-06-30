"use client";

import { cn } from "@/lib/utils";
import { Switch } from "./switch";

type LabeledSwitchProps = {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
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
    <div className="flex items-start gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn("mt-0.5 shrink-0", switchClassName)}
      />
    </div>
  );
}
