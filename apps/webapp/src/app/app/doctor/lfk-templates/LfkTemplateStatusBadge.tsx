import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TemplateStatus } from "@/modules/lfk-templates/types";

export function lfkTemplateStatusLabel(status: TemplateStatus): string {
  if (status === "archived") return "В архиве";
  if (status === "published") return "Опубликован";
  return "Черновик";
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function statusVariant(status: TemplateStatus): BadgeVariant {
  if (status === "archived") return "destructive";
  if (status === "published") return "outline";
  return "secondary";
}

export function LfkTemplateStatusBadge({
  status,
  className,
}: {
  status: TemplateStatus;
  className?: string;
}) {
  const label = lfkTemplateStatusLabel(status);
  const variant = statusVariant(status);
  return (
    <Badge
      variant={variant}
      className={cn(
        "max-w-full shrink-0 truncate font-medium",
        status === "published" &&
          "border-emerald-600/35 bg-emerald-600/12 text-emerald-900 dark:border-emerald-500/45 dark:bg-emerald-500/12 dark:text-emerald-50",
        className,
      )}
      title={label}
    >
      {label}
    </Badge>
  );
}
