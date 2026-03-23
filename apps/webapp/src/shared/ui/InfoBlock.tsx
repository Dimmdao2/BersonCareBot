import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type InfoBlockProps = {
  children: ReactNode;
  variant?: "info" | "important";
  className?: string;
};

export function InfoBlock({ children, variant = "info", className }: InfoBlockProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 text-sm",
        variant === "info" && "border-border/80 bg-muted/60 text-foreground",
        variant === "important" && "border-destructive/30 bg-destructive/10 text-destructive",
        className,
      )}
    >
      {children}
    </div>
  );
}
