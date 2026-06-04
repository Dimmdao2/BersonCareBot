"use client";

import { useEffect, useState, useTransition } from "react";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { BOOKING_FORM_MAX_WIDTH_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";

export type BookingPatientPick = {
  id: string;
  displayName: string;
  phone: string | null;
};

type Props = {
  value: BookingPatientPick | null;
  onChange: (patient: BookingPatientPick | null) => void;
};

export function BookingPatientSearchPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookingPatientPick[]>([]);
  const [pending, startTransition] = useTransition();

  const trimmedQuery = query.trim();
  const showResults = trimmedQuery.length >= 2;

  useEffect(() => {
    if (!showResults) return;
    const t = window.setTimeout(() => {
      startTransition(async () => {
        const res = await fetch(
          `/api/doctor/clients/search?q=${encodeURIComponent(trimmedQuery)}&limit=10`,
        );
        const json = (await res.json()) as {
          ok?: boolean;
          clients?: Array<{ id: string; displayName: string; phone: string | null }>;
        };
        if (json.ok && json.clients) {
          setResults(json.clients);
        } else {
          setResults([]);
        }
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [trimmedQuery, showResults]);

  return (
    <div className={`space-y-2 ${BOOKING_FORM_MAX_WIDTH_CLASS}`}>
      <Label>Пациент</Label>
      {value ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <span className="font-medium">{value.displayName}</span>
          {value.phone ? <span className="text-muted-foreground">{value.phone}</span> : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Сменить
          </Button>
        </div>
      ) : (
        <>
          <Input
            placeholder="Имя или телефон"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {pending ? <p className="text-xs text-muted-foreground">Поиск…</p> : null}
          {showResults && results.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto rounded-md border text-sm">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted"
                    onClick={() => {
                      onChange(c);
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    <span className="font-medium">{c.displayName}</span>
                    {c.phone ? <span className="text-xs text-muted-foreground">{c.phone}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
