"use client";

import type { ComponentProps } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger as SharedSelectTrigger,
  SelectValue,
} from "@/shared/ui/primitives/select";
import { cn } from "@/lib/utils";

/** Doctor-only pill select trigger. Explicit caller radii remain authoritative. */
export function SelectTrigger({
  className,
  ...props
}: ComponentProps<typeof SharedSelectTrigger>) {
  return (
    <SharedSelectTrigger
      className={cn("rounded-[var(--doctor-control-radius,24px)] bg-white", className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectValue,
};
