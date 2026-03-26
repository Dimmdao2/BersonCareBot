"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PatientHomeMailingRow } from "@/modules/patient-home/repository";

const STORAGE_PREFIX = "patient-home-mailings-dismissed:";

type Props = {
  userId: string;
  items: PatientHomeMailingRow[];
};

function readDismissed(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

export function PatientHomeMailingsSection({ userId, items }: Props) {
  const storageKey = `${STORAGE_PREFIX}${userId}`;
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed(storageKey));

  const visible = items.filter((i) => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  const markViewed = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <section id="patient-home-mailings-section" className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">Уведомления</h2>
      <ul className="flex flex-col gap-2">
        {visible.map((row) => (
          <li
            key={row.id}
            className="border-border/80 bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <span>{row.label}</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => markViewed(row.id)}>
              Просмотрено
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
