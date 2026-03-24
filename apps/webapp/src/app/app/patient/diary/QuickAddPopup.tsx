"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addSymptomEntry } from "./symptoms/actions";
import { markLfkSession } from "./lfk/actions";

type Props = {
  trackings: { id: string; title: string }[];
  complexes: { id: string; title: string }[];
};

/** Кнопка «+» и модалка быстрого добавления записи симптома или отметки ЛФК. */
export function QuickAddPopup({ trackings, complexes }: Props) {
  const [open, setOpen] = useState(false);
  const [symValue, setSymValue] = useState<number | null>(5);

  if (trackings.length === 0 && complexes.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        size="icon-lg"
        variant="default"
        className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full shadow-lg md:bottom-8"
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
                action={async (fd) => {
                  await addSymptomEntry(fd);
                  toast.success("Запись сохранена");
                  setOpen(false);
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
                <Button type="submit" className="w-full" disabled={symValue === null}>
                  Сохранить симптом
                </Button>
              </form>
            </section>
          ) : null}

          {complexes.length > 0 ? (
            <section className="stack gap-2">
              <h3 className="text-sm font-medium">ЛФК</h3>
              <form
                className="stack gap-2"
                action={async (fd) => {
                  await markLfkSession(fd);
                  toast.success("Занятие отмечено");
                  setOpen(false);
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
                <Button type="submit" className="w-full">
                  Выполнено
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
