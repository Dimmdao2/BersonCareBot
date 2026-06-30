"use client";

/**
 * Микро-график (полоски) статистики выполнения упражнения за последнюю неделю.
 *
 * Переиспользуемый компонент (B.3). Рисует то, что есть в данных:
 * - reps / повторения
 * - weightKg / вес
 * - difficulty / тяжесть (easy → зелёный, medium → жёлтый, hard → красный)
 * - sets / подходы — зарезервировано для Фазы C; рисуется когда данные придут без переделки.
 *
 * Метрики, по которым нет ни одной ненулевой точки, скрываются полностью.
 * Канон: h-8 контролы, text-xs, text-[10px] для осей, без теней, rounded-md.
 */

import { cn } from "@/lib/utils";
import type { LfkPostSessionDifficulty } from "@/modules/treatment-program/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type ExerciseMetricPoint = {
  at: string;
  reps: number | null;
  weightKg: number | null;
  sets: number | null;
  difficulty: LfkPostSessionDifficulty | null;
};

type MetricKey = "reps" | "weightKg" | "sets" | "difficulty";

const METRIC_LABELS: Record<MetricKey, string> = {
  reps: "повт.",
  weightKg: "кг",
  sets: "подх.",
  difficulty: "тяжесть",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function difficultyColor(d: LfkPostSessionDifficulty): string {
  if (d === "easy") return "bg-emerald-500";
  if (d === "medium") return "bg-amber-400";
  return "bg-destructive";
}

function difficultyLabel(d: LfkPostSessionDifficulty): string {
  if (d === "easy") return "легко";
  if (d === "medium") return "норм.";
  return "тяжело";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit" });
}

/**
 * Вычисляет высоту бара в диапазоне [12, 28]px пропорционально max значению в серии.
 * min-height = 4px чтобы нулевые значения (которые не null) не исчезали, но здесь
 * null-значения исключаются из bars целиком.
 */
function barHeight(value: number, max: number): number {
  if (max <= 0) return 4;
  return Math.max(4, Math.round((value / max) * 24));
}

// ── Компонент одной метрики (полоски по точкам) ───────────────────────────────

type MetricRowProps = {
  label: string;
  points: ExerciseMetricPoint[];
  renderBar: (point: ExerciseMetricPoint, idx: number) => React.ReactNode;
};

function MetricRow({ label, points, renderBar }: MetricRowProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-end gap-1">
        {points.map((p, i) => renderBar(p, i))}
      </div>
    </div>
  );
}

// ── Числовой бар ─────────────────────────────────────────────────────────────

type NumericBarProps = {
  value: number;
  max: number;
  label: string;
  dateLabel: string;
};

function NumericBar({ value, max, label, dateLabel }: NumericBarProps) {
  const h = barHeight(value, max);
  return (
    <div className="flex flex-col items-center gap-0.5 group" title={`${dateLabel}: ${label}`}>
      <span className="text-[9px] text-muted-foreground leading-none opacity-0 group-hover:opacity-100 transition-opacity">
        {label}
      </span>
      <div
        className="w-4 rounded-sm bg-primary/60 hover:bg-primary/80 transition-colors"
        style={{ height: `${h}px` }}
      />
      <span className="text-[9px] text-muted-foreground leading-none">{dateLabel}</span>
    </div>
  );
}

// ── Difficulty бар (цветные кружки / бейджи) ─────────────────────────────────

type DifficultyBarProps = {
  value: LfkPostSessionDifficulty;
  dateLabel: string;
};

function DifficultyBar({ value, dateLabel }: DifficultyBarProps) {
  return (
    <div
      className="flex flex-col items-center gap-0.5"
      title={`${dateLabel}: ${difficultyLabel(value)}`}
    >
      <div className={cn("w-3 h-3 rounded-full", difficultyColor(value))} />
      <span className="text-[9px] text-muted-foreground leading-none">{dateLabel}</span>
    </div>
  );
}

// ── Главный компонент ─────────────────────────────────────────────────────────

type ExerciseMicroChartProps = {
  points: ExerciseMetricPoint[];
  className?: string;
};

export function ExerciseMicroChart({ points, className }: ExerciseMicroChartProps) {
  if (points.length === 0) {
    return (
      <p className={cn("text-[10px] text-muted-foreground", className)}>
        Нет данных за последние 7 дней
      </p>
    );
  }

  // Обратный порядок: старые слева, новые справа
  const ordered = [...points].sort((a, b) => a.at.localeCompare(b.at));

  // Определяем, какие метрики реально есть в данных
  const hasReps = ordered.some((p) => p.reps !== null);
  const hasWeightKg = ordered.some((p) => p.weightKg !== null);
  const hasSets = ordered.some((p) => p.sets !== null);
  const hasDifficulty = ordered.some((p) => p.difficulty !== null);

  const maxReps = hasReps
    ? Math.max(...ordered.map((p) => p.reps ?? 0))
    : 0;
  const maxWeightKg = hasWeightKg
    ? Math.max(...ordered.map((p) => p.weightKg ?? 0))
    : 0;
  const maxSets = hasSets
    ? Math.max(...ordered.map((p) => p.sets ?? 0))
    : 0;

  const hasAnyMetric = hasReps || hasWeightKg || hasSets || hasDifficulty;

  if (!hasAnyMetric) {
    return (
      <p className={cn("text-[10px] text-muted-foreground", className)}>
        Выполнено {ordered.length} раз, метрики не зафиксированы
      </p>
    );
  }

  return (
    <div className={cn("flex flex-row flex-wrap items-start gap-x-4 gap-y-2", className)}>
      {hasReps && (
        <MetricRow
          label={METRIC_LABELS.reps}
          points={ordered.filter((p) => p.reps !== null)}
          renderBar={(p, i) => (
            <NumericBar
              key={i}
              value={p.reps!}
              max={maxReps}
              label={String(p.reps)}
              dateLabel={formatDate(p.at)}
            />
          )}
        />
      )}
      {hasWeightKg && (
        <MetricRow
          label={METRIC_LABELS.weightKg}
          points={ordered.filter((p) => p.weightKg !== null)}
          renderBar={(p, i) => (
            <NumericBar
              key={i}
              value={p.weightKg!}
              max={maxWeightKg}
              label={`${p.weightKg} кг`}
              dateLabel={formatDate(p.at)}
            />
          )}
        />
      )}
      {/* sets: Фаза C — рисуется автоматически когда появятся данные */}
      {hasSets && (
        <MetricRow
          label={METRIC_LABELS.sets}
          points={ordered.filter((p) => p.sets !== null)}
          renderBar={(p, i) => (
            <NumericBar
              key={i}
              value={p.sets!}
              max={maxSets}
              label={String(p.sets)}
              dateLabel={formatDate(p.at)}
            />
          )}
        />
      )}
      {hasDifficulty && (
        <MetricRow
          label={METRIC_LABELS.difficulty}
          points={ordered.filter((p) => p.difficulty !== null)}
          renderBar={(p, i) => (
            <DifficultyBar
              key={i}
              value={p.difficulty!}
              dateLabel={formatDate(p.at)}
            />
          )}
        />
      )}
    </div>
  );
}
