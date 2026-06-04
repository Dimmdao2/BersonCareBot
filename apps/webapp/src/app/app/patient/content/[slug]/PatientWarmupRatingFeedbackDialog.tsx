"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/patient/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/patient/primitives/dialog";
import { cn } from "@/lib/utils";
import {
  MATERIAL_RATING_FEEDBACK_REASON_CODES,
  MATERIAL_RATING_FEEDBACK_REASON_LABELS,
  type MaterialRatingFeedbackReasonCode,
} from "@/modules/material-rating-feedback/reasonCodes";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentPageId: string;
  ratingValue: number;
};

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

export function PatientWarmupRatingFeedbackDialog({
  open,
  onOpenChange,
  contentPageId,
  ratingValue,
}: Props) {
  const [selected, setSelected] = useState<MaterialRatingFeedbackReasonCode[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setComment("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const canSubmit = selected.length > 0 || comment.trim().length > 0;

  function toggleReason(code: MaterialRatingFeedbackReasonCode) {
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(fetchApiUrl("/api/patient/material-ratings/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentPageId,
          ratingValue,
          reasonCodes: selected,
          comment: comment.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError("Не удалось отправить");
        return;
      }
      onOpenChange(false);
    } catch {
      setError("Не удалось отправить");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => onOpenChange(!!nextOpen)}>
      <DialogContent className="border-[var(--patient-border)] bg-[var(--patient-card-bg)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Расскажите, что было не так — это поможет точнее подбирать разминки.</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {MATERIAL_RATING_FEEDBACK_REASON_CODES.map((code) => {
            const active = selected.includes(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={active}
                disabled={submitting}
                onClick={() => toggleReason(code)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-[var(--patient-accent)] bg-[var(--patient-accent)]/10 text-foreground"
                    : "border-[var(--patient-border)] bg-background text-foreground hover:bg-muted/40",
                )}
              >
                {MATERIAL_RATING_FEEDBACK_REASON_LABELS[code]}
              </button>
            );
          })}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={submitting}
          rows={4}
          className="w-full resize-y rounded-md border border-[var(--patient-border)] bg-background px-3 py-2 text-sm"
          aria-label="Комментарий"
        />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            Пропустить
          </Button>
          <Button type="button" disabled={!canSubmit || submitting} onClick={() => void handleSubmit()}>
            {submitting ? "Отправка…" : "Отправить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
