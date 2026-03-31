"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateTrackingForm } from "./CreateTrackingForm";
import { SymptomTrackingRow } from "./SymptomTrackingRow";

export function SymptomsTrackingSectionClient({
  trackings,
}: {
  trackings: { id: string; symptomTitle: string | null }[];
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [rows, setRows] = useState(trackings);

  useEffect(() => {
    setRows(trackings);
  }, [trackings]);

  return (
    <section
      id="patient-symptoms-tracking-section"
      className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4"
    >
      <h2 className="text-lg font-semibold">Отслеживаемые симптомы</h2>
      {rows.length > 0 ? (
        <ul id="patient-symptoms-tracking-list" className="m-0 list-none space-y-3 p-0">
          {rows.map((t) => (
            <SymptomTrackingRow key={t.id} id={t.id} title={t.symptomTitle ?? "—"} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Пока нет отслеживаний — добавьте симптом ниже.</p>
      )}

      {addOpen ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <CreateTrackingForm
            onSuccess={(t) => {
              setAddOpen(false);
              setRows((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]));
              router.refresh();
            }}
          />
          <Button type="button" variant="ghost" className="self-start" onClick={() => setAddOpen(false)}>
            Отмена
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setAddOpen(true)}>
          Добавить отслеживание
        </Button>
      )}
    </section>
  );
}
