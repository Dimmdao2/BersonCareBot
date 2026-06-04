"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";

type CommentRow = {
  id: string;
  body: string;
  createdAt: string;
};

type Props = {
  appointmentId: string;
  commentsApiPath?: string;
  onChanged?: () => void;
};

export function AppointmentStaffCommentsSection({
  appointmentId,
  commentsApiPath = "/api/doctor/booking-engine/appointments",
  onChanged,
}: Props) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${commentsApiPath}/${encodeURIComponent(appointmentId)}/comments`,
      );
      const json = (await res.json()) as { ok?: boolean; comments?: CommentRow[] };
      if (res.ok && json.ok) {
        setComments(json.comments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [appointmentId, commentsApiPath]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `${commentsApiPath}/${encodeURIComponent(appointmentId)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const json = (await res.json()) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setError("Не удалось сохранить");
        return;
      }
      setDraft("");
      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      {loading ? <p className="text-xs text-muted-foreground">Загрузка…</p> : null}
      {comments.length > 0 ? (
        <ul className="m-0 list-none space-y-1 p-0">
          {comments.map((c) => (
            <li key={c.id} className="text-xs whitespace-pre-wrap">
              {c.body}
              <span className="ml-2 text-muted-foreground">
                {new Date(c.createdAt).toLocaleString("ru-RU")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <Textarea
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Комментарий к записи"
        disabled={saving}
      />
      <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void submit()}>
        Добавить комментарий
      </Button>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
