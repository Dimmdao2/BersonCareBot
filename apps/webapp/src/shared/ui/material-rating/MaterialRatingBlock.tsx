"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { Rating, Star as RatingStarShape } from "@smastrom/react-rating";
import "@smastrom/react-rating/style.css";
import { cn } from "@/lib/utils";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { ruRatingCountLabel } from "@/shared/lib/ruRatingCountLabel";
import type { MaterialRatingTargetKind } from "@/modules/material-rating/types";
import { MaterialRatingNativeStars } from "./MaterialRatingNativeStars";

export type MaterialRatingBlockProps = {
  targetKind: MaterialRatingTargetKind;
  targetId: string;
  programInstanceId?: string;
  programStageItemId?: string;
  guest?: boolean;
  needsActivation?: boolean;
  readOnly?: boolean;
  variant?: "patient" | "doctorCompact";
  className?: string;
};

type LoadPayload = {
  avg: number | null;
  count: number;
  myStars: number | null;
};

function buildQuery(
  targetKind: MaterialRatingTargetKind,
  targetId: string,
  programInstanceId?: string,
  programStageItemId?: string,
) {
  const sp = new URLSearchParams({ kind: targetKind, id: targetId });
  if (programInstanceId) sp.set("programInstanceId", programInstanceId);
  if (programStageItemId) sp.set("programStageItemId", programStageItemId);
  return sp.toString();
}

/** Undici/jsdom требует абсолютный URL; в браузере достаточно относительного пути. */
function fetchApiUrl(pathWithLeadingSlash: string): string {
  if (pathWithLeadingSlash.startsWith("http://") || pathWithLeadingSlash.startsWith("https://")) {
    return pathWithLeadingSlash;
  }
  const origin =
    typeof window !== "undefined" &&
    window.location?.origin &&
    window.location.origin !== "null" &&
    window.location.origin !== "undefined"
      ? window.location.origin
      : "http://localhost";
  return new URL(pathWithLeadingSlash, origin).toString();
}

/** Цвета и обводка звёзд (см. `.material-rating-stars` в `globals.css`). */
const MATERIAL_RATING_ITEM_STYLES = {
  itemShapes: RatingStarShape,
  itemStrokeWidth: 2,
  activeFillColor: "#f7965c",
  inactiveFillColor: "#fff7ed",
  activeStrokeColor: "#bb5e26",
  inactiveStrokeColor: "#eda76a",
} as const;

type SmastromBoundaryProps = {
  children: React.ReactNode;
  fallback: React.ReactNode;
};

type SmastromBoundaryState = { failed: boolean };

/** При смене материала родитель задаёт `key` — состояние ошибки сбрасывается без `setState` в update. */
class MaterialRatingSmastromBoundary extends React.Component<SmastromBoundaryProps, SmastromBoundaryState> {
  constructor(props: SmastromBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): SmastromBoundaryState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function MaterialRatingBlock({
  targetKind,
  targetId,
  programInstanceId,
  programStageItemId,
  guest = false,
  needsActivation = false,
  readOnly = false,
  variant = "patient",
  className,
}: MaterialRatingBlockProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aggregate, setAggregate] = useState<LoadPayload | null>(null);
  const [value, setValue] = useState(0);
  /** После подтверждения «Изменить оценку» — снова полноразмерный выбор (до сохранения новой). */
  const [editRatingPicker, setEditRatingPicker] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const interactive = !readOnly && !guest && !needsActivation;
  const isDoctorCompact = variant === "doctorCompact";
  const ratingKey = `${targetKind}:${targetId}:${programInstanceId ?? ""}:${programStageItemId ?? ""}`;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path = isDoctorCompact
        ? `/api/doctor/material-ratings/aggregate?kind=${encodeURIComponent(targetKind)}&id=${encodeURIComponent(targetId)}`
        : `/api/patient/material-ratings?${buildQuery(targetKind, targetId, programInstanceId, programStageItemId)}`;
      const res = await fetch(fetchApiUrl(path), { method: "GET" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        avg?: number | null;
        count?: number;
        myStars?: number | null;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error === "not_found" ? "" : "Не удалось загрузить оценки");
        setAggregate(null);
        return;
      }
      const payload: LoadPayload = {
        avg: data.avg ?? null,
        count: data.count ?? 0,
        myStars: data.myStars ?? null,
      };
      setAggregate(payload);
      setValue(payload.myStars ?? 0);
    } catch {
      setError("Не удалось загрузить оценки");
      setAggregate(null);
    } finally {
      setLoading(false);
    }
  }, [targetId, targetKind, programInstanceId, programStageItemId, isDoctorCompact]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setEditRatingPicker(false);
  }, [ratingKey]);

  const scheduleSave = useCallback(
    (next: number) => {
      if (!interactive || next < 1 || next > 5) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void (async () => {
          try {
            const res = await fetch(fetchApiUrl("/api/patient/material-ratings"), {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                targetKind,
                targetId,
                stars: next,
                programInstanceId: programInstanceId ?? undefined,
                programStageItemId: programStageItemId ?? undefined,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              avg?: number | null;
              count?: number;
              myStars?: number | null;
            };
            if (!res.ok || !data.ok) {
              setError("Не удалось сохранить");
              await load();
              return;
            }
            setError(null);
            const my = data.myStars ?? null;
            setAggregate({
              avg: data.avg ?? null,
              count: data.count ?? 0,
              myStars: my,
            });
            setValue(my ?? 0);
            setEditRatingPicker(false);
          } catch {
            setError("Не удалось сохранить");
            await load();
          }
        })();
      }, 320);
    },
    [interactive, load, programInstanceId, programStageItemId, targetId, targetKind],
  );

  const pickerClassName = cn("material-rating-stars material-rating-stars--size-primary");

  const nativeStars = (
    <MaterialRatingNativeStars
      value={value}
      readOnly={!interactive}
      onChange={(v) => {
        setValue(v);
        scheduleSave(v);
      }}
      className={pickerClassName}
      aria-label="Оценка материала"
    />
  );

  if (isDoctorCompact) {
    if (loading && !aggregate) {
      return <p className={cn("text-xs text-muted-foreground", className)}>…</p>;
    }
    if (!aggregate || aggregate.count === 0) {
      return <p className={cn("text-xs text-muted-foreground", className)}>Нет оценок</p>;
    }
    return (
      <p className={cn("text-xs text-muted-foreground tabular-nums", className)}>
        Средняя {aggregate.avg != null ? aggregate.avg.toFixed(1) : "—"} · {aggregate.count}{" "}
        {ruRatingCountLabel(aggregate.count)}
      </p>
    );
  }

  if (loading && !aggregate) {
    return (
      <div className={cn(patientMutedTextClass, "text-sm", className)} aria-busy>
        …
      </div>
    );
  }

  if (error && !aggregate) {
    return null;
  }

  const myStars = aggregate?.myStars;
  const hasSavedVote = typeof myStars === "number" && myStars >= 1;
  const showSummaryRow = hasSavedVote && !editRatingPicker && !guest;
  const showChangeLink = showSummaryRow && interactive;
  const showStarPicker = !showSummaryRow;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {showSummaryRow ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal leading-snug">
          <span className={cn(patientMutedTextClass, "font-normal")}>Ваша оценка:</span>
          <span className="inline-flex items-center gap-1.5" aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => {
              const filled = n <= (myStars ?? 0);
              return (
                <Star
                  key={n}
                  size={15}
                  className="shrink-0"
                  fill={filled ? "#f7965c" : "#fff7ed"}
                  stroke={filled ? "#bb5e26" : "#eda76a"}
                  strokeWidth={1.5}
                />
              );
            })}
          </span>
          {showChangeLink ? (
            <button
              type="button"
              className={cn(
                patientMutedTextClass,
                "cursor-pointer border-0 bg-transparent p-0 text-[11px] font-normal underline decoration-muted-foreground/55 underline-offset-2 hover:opacity-90",
              )}
              onClick={() => {
                if (!window.confirm("Сбросить вашу прошлую оценку?")) return;
                setEditRatingPicker(true);
                setValue(0);
              }}
            >
              Изменить оценку
            </button>
          ) : null}
        </div>
      ) : null}
      {showStarPicker ? (
        <MaterialRatingSmastromBoundary key={ratingKey} fallback={nativeStars}>
          <Rating
            value={value}
            readOnly={!interactive}
            isRequired={false}
            onChange={(v: number) => {
              setValue(v);
              scheduleSave(v);
            }}
            aria-label="Оценка материала"
            className={pickerClassName}
            itemStyles={MATERIAL_RATING_ITEM_STYLES}
            spaceBetween="medium"
          />
        </MaterialRatingSmastromBoundary>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
