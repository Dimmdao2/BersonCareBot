"use client"

import { forwardRef } from "react"
import "@/shared/ui/doctor/tiptap/primitives/badge/badge-colors.scss"
import "@/shared/ui/doctor/tiptap/primitives/badge/badge-group.scss"
import "@/shared/ui/doctor/tiptap/primitives/badge/badge.scss"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "ghost" | "white" | "gray" | "green" | "yellow" | "default"
  size?: "default" | "small"
  appearance?: "default" | "subdued" | "emphasized"
  trimText?: boolean
}

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  (
    {
      variant,
      size = "default",
      appearance = "default",
      trimText = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`tiptap-badge ${className || ""}`}
        data-style={variant}
        data-size={size}
        data-appearance={appearance}
        data-text-trim={trimText ? "on" : "off"}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Badge.displayName = "Badge"

export default Badge
