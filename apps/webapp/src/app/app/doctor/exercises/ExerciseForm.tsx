"use client";

import { useState } from "react";
import Link from "next/link";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Exercise, ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { cn } from "@/lib/utils";
import { archiveDoctorExercise, saveDoctorExercise } from "./actions";

const LOAD_OPTIONS: { value: ExerciseLoadType; label: string }[] = [
  { value: "strength", label: "Силовая" },
  { value: "stretch", label: "Растяжка" },
  { value: "balance", label: "Баланс" },
  { value: "cardio", label: "Кардио" },
  { value: "other", label: "Другое" },
];

type ExerciseFormProps = {
  exercise?: Exercise | null;
};

export function ExerciseForm({ exercise }: ExerciseFormProps) {
  const [regionRefId, setRegionRefId] = useState<string | null>(exercise?.regionRefId ?? null);
  const [regionLabel, setRegionLabel] = useState("");
  const [loadType, setLoadType] = useState<ExerciseLoadType | "">(exercise?.loadType ?? "");
  const [difficulty, setDifficulty] = useState<number>(exercise?.difficulty1_10 ?? 5);

  const tagsStr = exercise?.tags?.join(", ") ?? "";

  return (
    <div className="stack max-w-2xl gap-6">
      <form action={saveDoctorExercise} className="stack gap-4">
        {exercise ? <input type="hidden" name="id" value={exercise.id} /> : null}
        <input type="hidden" name="regionRefId" value={regionRefId ?? ""} />

        <div className="stack gap-2">
          <Label htmlFor="ex-title">Название</Label>
          <Input
            id="ex-title"
            name="title"
            required
            defaultValue={exercise?.title ?? ""}
            placeholder="Например, разгибание колена сидя"
          />
        </div>

        <div className="stack gap-2">
          <Label htmlFor="ex-desc">Описание</Label>
          <textarea
            id="ex-desc"
            name="description"
            className="auth-input min-h-[100px] w-full"
            defaultValue={exercise?.description ?? ""}
            placeholder="Краткая техника выполнения"
          />
        </div>

        <div className="stack gap-2">
          <span className="text-sm font-medium">Область тела</span>
          <ReferenceSelect
            categoryCode="body_region"
            value={regionRefId}
            onChange={(refId, label) => {
              setRegionRefId(refId);
              setRegionLabel(label);
            }}
            placeholder="Выберите область"
          />
          {regionLabel ? (
            <p className="text-xs text-muted-foreground">Выбрано: {regionLabel}</p>
          ) : null}
        </div>

        <div className="stack gap-2">
          <Label>Тип нагрузки</Label>
          <input type="hidden" name="loadType" value={loadType} />
          <Select
            value={loadType || undefined}
            onValueChange={(v) => {
              if (v) setLoadType(v as ExerciseLoadType);
            }}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Не выбран" />
            </SelectTrigger>
            <SelectContent>
              {LOAD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="stack gap-2">
          <Label htmlFor="ex-difficulty">Сложность (1–10)</Label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="ex-difficulty"
              name="difficulty1_10"
              type="range"
              min={1}
              max={10}
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
              className="w-full max-w-xs accent-primary"
            />
            <span className="text-sm tabular-nums text-muted-foreground">{difficulty}</span>
          </div>
        </div>

        <div className="stack gap-2">
          <Label htmlFor="ex-contra">Противопоказания</Label>
          <textarea
            id="ex-contra"
            name="contraindications"
            className="auth-input min-h-[72px] w-full"
            defaultValue={exercise?.contraindications ?? ""}
          />
        </div>

        <div className="stack gap-2">
          <Label htmlFor="ex-tags">Теги (через запятую)</Label>
          <Input id="ex-tags" name="tags" defaultValue={tagsStr} placeholder="колено, дома" />
        </div>

        <div className="stack gap-2 rounded-lg border border-border/60 p-3">
          <p className="text-sm font-medium">Медиа (опционально)</p>
          <Input
            name="mediaUrl"
            type="url"
            placeholder="https://…"
            defaultValue={exercise?.media[0]?.mediaUrl ?? ""}
          />
          <div className="flex flex-wrap gap-2">
            <Label className="text-xs text-muted-foreground">Тип файла</Label>
            <select
              name="mediaType"
              className="auth-input text-sm"
              defaultValue={exercise?.media[0]?.mediaType ?? ""}
            >
              <option value="">—</option>
              <option value="image">Изображение</option>
              <option value="video">Видео</option>
              <option value="gif">GIF</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit">{exercise ? "Сохранить" : "Создать упражнение"}</Button>
          <Link href="/app/doctor/exercises" className={cn(buttonVariants({ variant: "outline" }))}>
            К списку
          </Link>
        </div>
      </form>

      {exercise ? (
        <form action={archiveDoctorExercise} className="border-t border-border/60 pt-4">
          <input type="hidden" name="id" value={exercise.id} />
          <Button type="submit" variant="destructive">
            Архивировать
          </Button>
        </form>
      ) : null}
    </div>
  );
}
