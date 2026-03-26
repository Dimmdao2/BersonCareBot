"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { markLfkSession } from "./actions";

type Complex = { id: string; title: string };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayDateParts(d = new Date()) {
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

/** Цвет «ручки» ползунка 0–10 (зелёный → жёлтый → красный). */
function lfkThumbColor(score: number): string {
  if (score <= 5) {
    const t = score / 5;
    const h = 120 + (45 - 120) * t;
    const s = 60 + (80 - 60) * t;
    const l = 40 + (50 - 40) * t;
    return `hsl(${h} ${s}% ${l}%)`;
  }
  const t = (score - 5) / 5;
  const h = 45 + (0 - 45) * t;
  const s = 80 + (70 - 80) * t;
  const l = 50 + (35 - 50) * t;
  return `hsl(${h} ${s}% ${l}%)`;
}

function formatDateButton(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function LfkSessionForm({ complexes }: { complexes: Complex[] }) {
  const defaults = useMemo(() => todayDateParts(), []);
  const [sessionDate, setSessionDate] = useState(defaults.date);
  const [sessionTime, setSessionTime] = useState(defaults.time);
  const [difficulty, setDifficulty] = useState(5);
  const [pain, setPain] = useState(0);
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState(defaults.date);
  const [timeDraft, setTimeDraft] = useState(defaults.time);

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
      <input type="hidden" name="sessionDate" value={sessionDate} />
      <input type="hidden" name="sessionTime" value={sessionTime} />
      <input type="hidden" name="difficulty0_10" value={difficulty} />
      <input type="hidden" name="pain0_10" value={pain} />

      <div className="flex min-w-0 gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="eyebrow">Дата</span>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full min-w-0 justify-start font-normal"
            onClick={() => {
              setDateDraft(sessionDate);
              setDateOpen(true);
            }}
          >
            {formatDateButton(sessionDate)}
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="eyebrow">Время</span>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full min-w-0 justify-start font-normal"
            onClick={() => {
              setTimeDraft(sessionTime);
              setTimeOpen(true);
            }}
          >
            {sessionTime}
          </Button>
        </div>
      </div>

      <Dialog open={dateOpen} onOpenChange={setDateOpen}>
        <DialogContent
          className="rounded-lg border border-border shadow-md sm:max-w-sm"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>Дата занятия</DialogTitle>
          </DialogHeader>
          <Input
            type="date"
            value={dateDraft}
            onChange={(e) => setDateDraft(e.target.value)}
            className="auth-input"
          />
          <DialogFooter className="flex flex-row flex-wrap gap-2 sm:justify-between">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 sm:flex-none"
              onClick={() => {
                const t = todayDateParts();
                setDateDraft(t.date);
                setSessionDate(t.date);
              }}
            >
              Сегодня
            </Button>
            <Button
              type="button"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setSessionDate(dateDraft);
                setDateOpen(false);
              }}
            >
              Готово
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={timeOpen} onOpenChange={setTimeOpen}>
        <DialogContent
          className="rounded-lg border border-border shadow-md sm:max-w-sm"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>Время</DialogTitle>
          </DialogHeader>
          <Input
            type="time"
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
            className="auth-input"
          />
          <DialogFooter>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => {
                setSessionTime(timeDraft);
                setTimeOpen(false);
              }}
            >
              Готово
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <span className="eyebrow">Сложность выполнения: {difficulty} баллов из 10</span>
        <input
          type="range"
          name="difficulty0_10_range"
          min={0}
          max={10}
          value={difficulty}
          onChange={(e) => setDifficulty(Number(e.target.value))}
          className="lfk-diary-range"
          style={
            {
              "--lfk-thumb": lfkThumbColor(difficulty),
              "--lfk-progress": `${(difficulty / 10) * 100}%`,
            } as React.CSSProperties
          }
          aria-valuenow={difficulty}
        />
      </label>
      <label className="stack gap-1">
        <span className="eyebrow">Боль: {pain} баллов из 10</span>
        <input
          type="range"
          name="pain0_10_range"
          min={0}
          max={10}
          value={pain}
          onChange={(e) => setPain(Number(e.target.value))}
          className="lfk-diary-range"
          style={
            {
              "--lfk-thumb": lfkThumbColor(pain),
              "--lfk-progress": `${(pain / 10) * 100}%`,
            } as React.CSSProperties
          }
          aria-valuenow={pain}
        />
      </label>
      <label className="stack gap-1">
        <span className="eyebrow">Комментарий</span>
        <Textarea name="comment" placeholder="Комментарий" maxLength={200} rows={3} className="auth-input" />
      </label>
      <Button type="submit">Сохранить</Button>
    </form>
  );
}
