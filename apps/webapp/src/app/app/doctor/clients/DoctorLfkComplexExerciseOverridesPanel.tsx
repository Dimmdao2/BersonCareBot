"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LfkComplexExerciseLine } from "@/modules/diaries/types";

function ExerciseRowEditor({
  patientUserId,
  line,
  onSaved,
}: {
  patientUserId: string;
  line: LfkComplexExerciseLine;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(line.localComment ?? "");
  const [pending, startTransition] = useTransition();
  const frozen = line.templateCommentSnapshot?.trim() ? line.templateCommentSnapshot.trim() : "—";

  return (
    <li className="rounded-md border border-border/70 bg-muted/10 p-3">
      <p className="text-sm font-medium">{line.exerciseTitle}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Из шаблона (заморожено): <span className="text-foreground">{frozen}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Для пациента:{" "}
        <span className="text-foreground">{line.effectiveComment?.trim() ? line.effectiveComment : "—"}</span>
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground" htmlFor={`lfk-lc-${line.id}`}>
          Индивидуальный комментарий (override)
        </Label>
        <Textarea
          id={`lfk-lc-${line.id}`}
          rows={2}
          className="text-sm"
          disabled={pending}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={frozen !== "—" ? `Из шаблона: ${frozen}` : "Из шаблона: —"}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const res = await fetch(
                  `/api/doctor/clients/${encodeURIComponent(patientUserId)}/lfk-complex-exercises/${encodeURIComponent(line.id)}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      localComment: draft.trim() === "" ? null : draft.trim(),
                    }),
                  },
                );
                const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
                if (!res.ok || !data.ok) {
                  toast.error(data.error ?? "Не удалось сохранить");
                  return;
                }
                toast.success("Сохранено");
                onSaved();
              });
            }}
          >
            {pending ? "Сохранение…" : "Сохранить"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setDraft("");
              startTransition(async () => {
                const res = await fetch(
                  `/api/doctor/clients/${encodeURIComponent(patientUserId)}/lfk-complex-exercises/${encodeURIComponent(line.id)}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ localComment: null }),
                  },
                );
                const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
                if (!res.ok || !data.ok) {
                  toast.error(data.error ?? "Не удалось сбросить");
                  return;
                }
                toast.success("Сброшено");
                onSaved();
              });
            }}
          >
            Сбросить override
          </Button>
        </div>
      </div>
    </li>
  );
}

export function DoctorLfkComplexExerciseOverridesPanel({
  patientUserId,
  complexes,
  linesByComplexId,
}: {
  patientUserId: string;
  complexes: { id: string; title: string }[];
  linesByComplexId: Record<string, LfkComplexExerciseLine[]>;
}) {
  const router = useRouter();
  const anyLines = complexes.some((c) => (linesByComplexId[c.id] ?? []).length > 0);
  if (!anyLines) return null;

  return (
    <div className="mt-3 space-y-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Комментарии к упражнениям в комплексе (B7)
      </p>
      {complexes.map((c) => {
        const lines = linesByComplexId[c.id] ?? [];
        if (lines.length === 0) return null;
        return (
          <div key={c.id} className="rounded-lg border border-border/60 bg-card/40 p-3">
            <p className="text-sm font-semibold">{c.title?.trim() || "Комплекс"}</p>
            <ul className="m-0 mt-2 list-none space-y-3 p-0">
              {lines.map((line) => (
                <ExerciseRowEditor
                  key={`${line.id}:${line.localComment ?? ""}:${line.templateCommentSnapshot ?? ""}`}
                  patientUserId={patientUserId}
                  line={line}
                  onSaved={() => {
                    router.refresh();
                  }}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
