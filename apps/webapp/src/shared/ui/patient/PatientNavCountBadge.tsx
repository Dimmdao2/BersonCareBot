import { cn } from "@/lib/utils";

/** Красный кружок с цифрой (как у напоминаний) для patient nav. */
export function PatientNavCountBadge(props: { count: number; className?: string }) {
  const { count, className } = props;
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground",
        className,
      )}
      aria-hidden
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
