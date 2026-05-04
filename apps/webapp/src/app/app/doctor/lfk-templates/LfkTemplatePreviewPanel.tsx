import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import type { Template, TemplateExercise } from "@/modules/lfk-templates/types";
import { lfkExerciseSideRu } from "@/modules/lfk-templates/lfkExerciseSide";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { exerciseMediaToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import { LfkTemplateStatusBadge } from "./LfkTemplateStatusBadge";

function TemplateExercisePreviewRow({ line }: { line: TemplateExercise }) {
  const title = line.exerciseTitle ?? line.exerciseId;
  const preview = line.firstMedia ? exerciseMediaToPreviewUi(line.firstMedia) : null;
  const side = lfkExerciseSideRu(line.side);
  const parts: { label: string; value: string }[] = [];
  if (line.reps != null) parts.push({ label: "Повторы", value: String(line.reps) });
  if (line.sets != null) parts.push({ label: "Подходы", value: String(line.sets) });
  if (side) parts.push({ label: "Сторона", value: side });
  if (line.maxPain0_10 != null) parts.push({ label: "Боль max", value: String(line.maxPain0_10) });
  if (line.comment?.trim()) parts.push({ label: "Комментарий", value: line.comment.trim() });

  return (
    <li className="flex w-full flex-col gap-2 rounded-lg border border-border/70 bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="w-9 shrink-0 self-stretch">
          {preview ? (
            <div className="relative min-h-9 overflow-hidden rounded border border-border/40 bg-muted/30">
              <MediaThumb
                media={preview}
                className="absolute inset-0 size-full"
                imgClassName="size-full object-cover"
                sizes="36px"
              />
            </div>
          ) : (
            <div className="min-h-9 rounded bg-muted" aria-hidden />
          )}
        </div>
        <p className="min-w-0 flex-1 text-sm font-medium leading-tight">{title}</p>
      </div>
      {parts.length > 0 ? (
        <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
          {parts.map((p) => (
            <div key={p.label} className="flex flex-wrap gap-x-2 gap-y-0.5">
              <dt className="shrink-0 font-medium text-foreground/80">{p.label}</dt>
              <dd className="min-w-0 break-words">{p.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

export function LfkTemplatePreviewPanel({ template }: { template: Template }) {
  const lines = [...template.exercises].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold leading-tight">{template.title}</h2>
        <LfkTemplateStatusBadge status={template.status} className="shrink-0" />
      </div>
      {template.description?.trim() ? (
        <p className="text-sm text-muted-foreground">{template.description.trim()}</p>
      ) : null}
      <p className="text-xs text-muted-foreground tabular-nums">
        Упражнений: {template.exerciseCount ?? lines.length}
      </p>
      <Link
        href={`/app/doctor/lfk-templates/${template.id}`}
        className={cn(buttonVariants(), "w-full sm:w-auto")}
      >
        Открыть конструктор
      </Link>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">В шаблоне пока нет упражнений.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((line) => (
            <TemplateExercisePreviewRow key={line.id} line={line} />
          ))}
        </ul>
      )}
    </div>
  );
}
