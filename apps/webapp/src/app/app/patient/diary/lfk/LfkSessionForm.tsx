"use client";

import { useMemo } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { markLfkSession } from "./actions";

type Complex = { id: string; title: string };

export function LfkSessionForm({ complexes }: { complexes: Complex[] }) {
  const defaults = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  }, []);

  if (complexes.length === 0) return null;

  const single = complexes.length === 1;

  return (
    <form
      id="patient-lfk-mark-session-form"
      className="stack gap-3"
      action={async (fd) => {
        await markLfkSession(fd);
        toast.success("Запись добавлена");
      }}
    >
      {single ? (
        <input type="hidden" name="complexId" value={complexes[0].id} />
      ) : (
        <label className="stack gap-1">
          <span className="eyebrow">Комплекс</span>
          <select name="complexId" required className="auth-input">
            {complexes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title ?? "—"}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex min-w-0 gap-2">
        <label className="stack min-w-0 flex-1 gap-1">
          <span className="eyebrow">Дата</span>
          <Input type="date" name="sessionDate" defaultValue={defaults.date} className="min-w-0" />
        </label>
        <label className="stack min-w-0 flex-1 gap-1">
          <span className="eyebrow">Время</span>
          <Input type="time" name="sessionTime" defaultValue={defaults.time} className="min-w-0" />
        </label>
      </div>
      <label className="stack gap-1">
        <span className="eyebrow">Длительность (мин)</span>
        <Input
          type="number"
          name="durationMinutes"
          min={1}
          max={600}
          placeholder="длительность выполнения"
          className="auth-input"
        />
        <span className="text-xs text-muted-foreground">минут</span>
      </label>
      <label className="stack gap-1">
        <span className="eyebrow">Сложность выполнения: баллов из 10</span>
        <input type="range" name="difficulty0_10" min={0} max={10} defaultValue={5} className="w-full" />
      </label>
      <label className="stack gap-1">
        <span className="eyebrow">Боль: баллов из 10</span>
        <input type="range" name="pain0_10" min={0} max={10} defaultValue={0} className="w-full" />
      </label>
      <label className="stack gap-1">
        <span className="eyebrow">Комментарий</span>
        <Textarea name="comment" placeholder="Комментарий" maxLength={200} rows={3} className="auth-input" />
      </label>
      <Button type="submit">Сохранить</Button>
    </form>
  );
}
