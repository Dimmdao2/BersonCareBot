"use client";

import { useRef, useState, useTransition } from "react";
import toast from "react-hot-toast";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addSymptomEntry } from "./symptoms/actions";
import { shouldConfirmInstantDuplicate, type LastSymptomSaveMeta } from "./symptoms/symptomEntryDedup";
import { markLfkSession } from "./lfk/actions";

type Props = {
  trackings: { id: string; title: string }[];
  complexes: { id: string; title: string }[];
};

/** Кнопка «+» и модалка быстрого добавления записи симптома или отметки ЛФК. */
export function QuickAddPopup({ trackings, complexes }: Props) {
  const [open, setOpen] = useState(false);
  const [symValue, setSymValue] = useState<number | null>(5);
  const [symPending, startSymTransition] = useTransition();
  const [lfkPending, startLfkTransition] = useTransition();
  const lastSavedRef = useRef<LastSymptomSaveMeta | null>(null);

  if (trackings.length === 0 && complexes.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        size="icon-lg"
        variant="default"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
        aria-label="Быстрое добавление"
        onClick={() => setOpen(true)}
      >
        <PlusIcon className="size-6" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Быстрое добавление</DialogTitle>
          </DialogHeader>
          <div className="stack gap-6">
            {trackings.length > 0 ? (
              <section className="stack gap-2">
                <h3 className="text-sm font-medium">Симптом</h3>
                <form
                  className="stack gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const fd = new FormData(form);
                    const trackingId = String(fd.get("trackingId") ?? "").trim();
                    if (!trackingId || symValue === null) {
                      toast.error("Выберите симптом и значение");
                      return;
                    }
                    if (shouldConfirmInstantDuplicate(lastSavedRef.current, trackingId, "instant")) {
                      if (
                        !window.confirm("Вы только что сделали такую запись. Сохранить ещё одну?")
                      ) {
                        return;
                      }
                    }
                    startSymTransition(async () => {
                      fd.set("value", String(symValue));
                      const result = await addSymptomEntry(fd);
                      if (result.ok) {
                        toast.success("Запись сохранена");
                        lastSavedRef.current = {
                          trackingId,
                          entryType: "instant",
                          at: Date.now(),
                        };
                        setOpen(false);
                      } else {
                        toast.error("Не удалось сохранить");
                      }
                    });
                  }}
                >
                  {trackings.length === 1 ? (
                    <input type="hidden" name="trackingId" value={trackings[0].id} />
                  ) : (
                    <select name="trackingId" className="auth-input" required defaultValue={trackings[0]?.id}>
                      {trackings.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: 11 }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`size-8 rounded-full border text-xs ${symValue === i ? "border-primary bg-primary/15" : ""}`}
                        onClick={() => setSymValue(i)}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="value" value={symValue !== null ? String(symValue) : ""} />
                  <input type="hidden" name="entryType" value="instant" />
                  <Button type="submit" className="w-full" disabled={symValue === null || symPending}>
                    {symPending ? "Сохраняю…" : "Сохранить симптом"}
                  </Button>
                </form>
              </section>
            ) : null}

            {complexes.length > 0 ? (
              <section className="stack gap-2">
                <h3 className="text-sm font-medium">ЛФК</h3>
                <form
                  className="stack gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    startLfkTransition(async () => {
                      await markLfkSession(fd);
                      toast.success("Занятие отмечено");
                      setOpen(false);
                    });
                  }}
                >
                  {complexes.length === 1 ? (
                    <input type="hidden" name="complexId" value={complexes[0].id} />
                  ) : (
                    <select name="complexId" className="auth-input" required>
                      {complexes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button type="submit" className="w-full" disabled={lfkPending}>
                    {lfkPending ? "Сохраняю…" : "Выполнено"}
                  </Button>
                </form>
              </section>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
