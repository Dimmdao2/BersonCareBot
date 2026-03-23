import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  children: ReactNode;
  variant?: "success" | "neutral" | "destructive";
  className?: string;
};

export function StatusBadge({ children, variant = "neutral", className }: StatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        variant === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
        variant === "neutral" && "border-border/80 bg-muted text-foreground",
        variant === "destructive" && "border-destructive/30 bg-destructive/15 text-destructive",
        className,
      )}
    >
      {children}
    </Badge>
  );
}
