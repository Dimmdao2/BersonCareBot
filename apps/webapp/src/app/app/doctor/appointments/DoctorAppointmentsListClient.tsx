"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/doctor/primitives/button";
import type { AppointmentRow } from "@/modules/doctor-appointments/ports";
import { doctorSectionCardClass } from "@/shared/ui/doctor/doctorVisual";
import { DoctorAppointmentActions } from "./DoctorAppointmentActions";

type Props = {
  appointments: AppointmentRow[];
  view: "future" | "past";
};

function formatDateKeyLabel(dateKey: string): string {
  if (!dateKey) return "Без даты";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      weekday: "short",
      day: "numeric",
      month: "long",
    }).format(new Date(dateKey));
  } catch {
    return dateKey;
  }
}

function groupByDateKey(
  rows: AppointmentRow[],
  order: "asc" | "desc",
): Array<{ dateKey: string; rows: AppointmentRow[] }> {
  const map = new Map<string, AppointmentRow[]>();
  for (const row of rows) {
    const key = row.dateKey || "";
    const existing = map.get(key);
    if (existing) {
      existing.push(row);
    } else {
      map.set(key, [row]);
    }
  }
  const groups: Array<{ dateKey: string; rows: AppointmentRow[] }> = [];
  for (const [dateKey, groupRows] of map) {
    groups.push({ dateKey, rows: groupRows });
  }
  // Пустые dateKey — в конце; порядок дат зависит от view (будущие: asc, архив: desc)
  groups.sort((a, b) => {
    if (!a.dateKey) return 1;
    if (!b.dateKey) return -1;
    const cmp = a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0;
    return order === "desc" ? -cmp : cmp;
  });
  return groups;
}

export function DoctorAppointmentsListClient({ appointments, view }: Props) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [archiveRows, setArchiveRows] = useState<AppointmentRow[]>(appointments);
  const [archiveOffset, setArchiveOffset] = useState(appointments.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(view === "past" && appointments.length >= 50);

  const displayRows = view === "past" ? archiveRows : appointments;
  const groups = groupByDateKey(displayRows, view === "past" ? "desc" : "asc");

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/doctor/appointments/list?view=past&offset=${archiveOffset}&limit=50`,
      );
      if (!res.ok) return;
      const json = (await res.json()) as { appointments?: AppointmentRow[] };
      const next = json.appointments ?? [];
      setArchiveRows((prev) => [...prev, ...next]);
      setArchiveOffset((prev) => prev + next.length);
      setHasMore(next.length >= 50);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {view === "future" ? (
          <>
            <span className="text-sm font-medium">Будущие</span>
            <Link
              href="?view=past"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Архив
            </Link>
          </>
        ) : (
          <>
            <Link
              href="?view=future"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Будущие
            </Link>
            <span className="text-sm font-medium">Архив</span>
          </>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {view === "future" ? "Нет предстоящих записей." : "Нет прошедших записей."}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map(({ dateKey, rows }) => (
            <div key={dateKey} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {formatDateKeyLabel(dateKey)}
              </p>
              <ul className="m-0 list-none space-y-2 p-0">
                {rows.map((a) => (
                  <li
                    key={a.id}
                    className={doctorSectionCardClass}
                    style={{ cursor: "pointer" }}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setExpandedId((prev) => (prev === a.id ? null : a.id))}
                    >
                      <div className="flex flex-col gap-1">
                        {a.scheduleProvenancePrefix ? (
                          <p className="text-xs text-muted-foreground">{a.scheduleProvenancePrefix}</p>
                        ) : null}
                        <span className="text-sm">
                          {a.time} — {a.clientLabel}{" "}
                          <span className="text-muted-foreground">({a.type}, {a.status})</span>
                        </span>
                        {a.branchName ? (
                          <span className="text-xs text-muted-foreground">{a.branchName}</span>
                        ) : null}
                        {a.rubitimeNameIfDifferent ? (
                          <span className="text-xs text-muted-foreground">
                            В Rubitime: {a.rubitimeNameIfDifferent}
                          </span>
                        ) : null}
                      </div>
                    </button>
                    {expandedId === a.id ? (
                      <div className="border-t border-border pt-2">
                        <DoctorAppointmentActions
                          recordId={a.id}
                          status={a.status}
                          onChanged={() => {
                            setExpandedId(null);
                            router.refresh();
                          }}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {view === "past" && hasMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingMore}
          onClick={loadMore}
        >
          {loadingMore ? "Загрузка..." : "Загрузить ещё"}
        </Button>
      ) : null}
    </div>
  );
}
