"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import toast from "react-hot-toast";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumericChipGroup } from "@/components/common/controls/NumericChipGroup";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addSymptomEntry } from "./symptoms/actions";
import { notifyDiarySymptomEntrySaved } from "@/modules/diaries/symptomDiaryClientEvents";
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
  const [pickedSymTrackingId, setPickedSymTrackingId] = useState<string | null>(null);
  const [pickedLfkComplexId, setPickedLfkComplexId] = useState<string | null>(null);

  const symTrackingId = useMemo(() => {
    if (trackings.length === 0) return "";
    if (trackings.length === 1) return trackings[0]!.id;
    if (pickedSymTrackingId && trackings.some((t) => t.id === pickedSymTrackingId)) return pickedSymTrackingId;
    return trackings[0]!.id;
  }, [trackings, pickedSymTrackingId]);

  const lfkComplexId = useMemo(() => {
    if (complexes.length === 0) return "";
    if (complexes.length === 1) return complexes[0]!.id;
    if (pickedLfkComplexId && complexes.some((c) => c.id === pickedLfkComplexId)) return pickedLfkComplexId;
    return complexes[0]!.id;
  }, [complexes, pickedLfkComplexId]);

  if (trackings.length === 0 && complexes.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        size="icon-lg"
        variant="default"
        className="safe-fab-br h-14 w-14 rounded-full shadow-lg"
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
          <div className="flex flex-col gap-6">
            {trackings.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Симптом</h3>
                <form
                  className="flex flex-col gap-2"
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
                        notifyDiarySymptomEntrySaved();
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
                    <>
                      <input type="hidden" name="trackingId" value={symTrackingId} />
                      <Select value={symTrackingId} onValueChange={(v) => v != null && setPickedSymTrackingId(v)}>
                        <SelectTrigger className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base shadow-none focus-visible:ring-2 focus-visible:ring-ring">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {trackings.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                  <NumericChipGroup
                    min={0}
                    max={10}
                    value={symValue}
                    onChange={setSymValue}
                    chipClassName="size-8 text-xs"
                  />
                  <input type="hidden" name="value" value={symValue !== null ? String(symValue) : ""} />
                  <input type="hidden" name="entryType" value="instant" />
                  <Button type="submit" className="w-full" disabled={symValue === null || symPending}>
                    {symPending ? "Сохраняю…" : "Сохранить симптом"}
                  </Button>
                </form>
              </section>
            ) : null}

            {complexes.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">ЛФК</h3>
                <form
                  className="flex flex-col gap-2"
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
                    <>
                      <input type="hidden" name="complexId" value={lfkComplexId} />
                      <Select value={lfkComplexId} onValueChange={(v) => v != null && setPickedLfkComplexId(v)}>
                        <SelectTrigger className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base shadow-none focus-visible:ring-2 focus-visible:ring-ring">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {complexes.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
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
