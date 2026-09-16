"use client"

import { cn } from "@/shared/ui/doctor/tiptap/lib/tiptap-utils"
import "@/shared/ui/doctor/tiptap/primitives/input/input.scss"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="tiptap-input"
      className={cn("tiptap-input", className)}
      {...props}
    />
  )
}

export { Input }
