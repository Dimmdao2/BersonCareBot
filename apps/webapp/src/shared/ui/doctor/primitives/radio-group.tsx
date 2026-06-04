"use client";

import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";

import { cn } from "@/lib/utils";

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props<string>) {
  return (
    <RadioGroupPrimitive data-slot="radio-group" className={cn("grid gap-2", className)} {...props} />
  );
}

function RadioGroupItem({ className, ...props }: Radio.Root.Props<string>) {
  return (
    <Radio.Root
      data-slot="radio-group-item"
      className={cn(
        "border-input text-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:bg-input/30 relative flex size-4 shrink-0 items-center justify-center rounded-full border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Radio.Indicator
        data-slot="radio-group-indicator"
        className="flex items-center justify-center"
      >
        <span className="bg-primary block size-2 rounded-full" />
      </Radio.Indicator>
    </Radio.Root>
  );
}

export { RadioGroup, RadioGroupItem };
