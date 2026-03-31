"use client";

import { useRef, useState, useTransition } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NumericChipGroup } from "@/components/common/controls/NumericChipGroup";
import { addSymptomEntry } from "./actions";
import { notifyDiarySymptomEntrySaved } from "@/modules/diaries/symptomDiaryClientEvents";
import { shouldConfirmInstantDuplicate, type LastSymptomSaveMeta } from "./symptomEntryDedup";

type TrackingOption = { id: string; symptomTitle: string | null };

export function AddEntryForm({ trackings }: { trackings: TrackingOption[] }) {
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const lastSavedRef = useRef<LastSymptomSaveMeta | null>(null);

  if (trackings.length === 0) {
    return null;
  }

  const single = trackings.length === 1;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const trackingId = String(fd.get("trackingId") ?? "").trim();
        const entryTypeRaw = fd.get("entryType");
        const et = entryTypeRaw === "daily" ? "daily" : "instant";

        if (!trackingId) return;
        if (selectedValue === null) {
          toast.error("Выберите интенсивность");
          return;
        }

        if (shouldConfirmInstantDuplicate(lastSavedRef.current, trackingId, et)) {
          if (
            !window.confirm("Вы только что сделали такую запись. Сохранить ещё одну?")
          ) {
            return;
          }
        }

        startTransition(async () => {
          const result = await addSymptomEntry(fd);
          if (result.ok) {
            toast.success("Запись сохранена");
            lastSavedRef.current = { trackingId, entryType: et, at: Date.now() };
            form.reset();
            setSelectedValue(null);
            notifyDiarySymptomEntrySaved();
          } else if (result.reason === "duplicate_instant") {
            toast.error("Похожая запись в моменте уже сохранена только что");
          } else if (result.reason === "duplicate_daily") {
            toast.error("Запись «за день» по этому симптому уже есть сегодня");
          } else {
            toast.error("Не удалось сохранить");
          }
        });
      }}
      className="flex flex-col gap-4"
    >
      {single ? (
        <input type="hidden" name="trackingId" value={trackings[0].id} />
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Симптом</span>
          <select
            id="symptom-entry-tracking"
            name="trackingId"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            required
            defaultValue={trackings[0]?.id}
          >
            {trackings.map((t) => (
              <option key={t.id} value={t.id}>
                {t.symptomTitle ?? "—"}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-col gap-4">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Интенсивность (0–10)</span>
        <NumericChipGroup min={0} max={10} value={selectedValue} onChange={setSelectedValue} />
        <input
          type="hidden"
          name="value"
          value={selectedValue !== null ? String(selectedValue) : ""}
        />
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Тип записи</span>
        <select id="symptom-entry-type" name="entryType" className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" required defaultValue="instant">
          <option value="instant">В моменте</option>
          <option value="daily">За день</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Заметки (необязательно)</span>
        <Textarea id="symptom-entry-notes" name="notes" rows={3} />
      </label>
      <Button type="submit" disabled={isPending || selectedValue === null}>
        {isPending ? "Сохраняю…" : "Сохранить запись"}
      </Button>
    </form>
  );
}
