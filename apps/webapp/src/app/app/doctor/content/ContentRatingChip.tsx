import { cn } from "@/lib/utils";
import { ruRatingCountLabel } from "@/shared/lib/ruRatingCountLabel";

export type ContentRatingSummary = { avg: number | null; count: number };

/**
 * Compact ★-rating chip for content material cards/rows (#2 Контент Шаг 3).
 * Green when the material has ratings; muted "Без оценок" otherwise.
 * No views chip — `content_pages` has no views column (aspirational in wireframe only).
 */
export function ContentRatingChip({
  rating,
  className,
}: {
  rating?: ContentRatingSummary | null;
  className?: string;
}) {
  if (!rating || rating.count === 0 || rating.avg == null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
          className,
        )}
      >
        Без оценок
      </span>
    );
  }

  return (
    <span
      title={`${rating.count} ${ruRatingCountLabel(rating.count)}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
        className,
      )}
    >
      <span aria-hidden>★</span>
      {rating.avg.toFixed(1)}
      <span className="font-normal text-emerald-600/80 dark:text-emerald-500/80">
        · {rating.count}
      </span>
    </span>
  );
}
