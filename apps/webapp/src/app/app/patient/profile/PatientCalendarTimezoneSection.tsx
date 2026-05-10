"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";

export function PatientCalendarTimezoneSection() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/patient/profile/calendar-timezone");
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        calendarTimezone?: string | null;
      };
      if (res.ok && data?.ok) {
        setValue(data.calendarTimezone ?? "");
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    const trimmed = value.trim();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/patient/profile/calendar-timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarTimezone: trimmed === "" ? null : trimmed,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg(
          data.error === "invalid_timezone"
            ? "Укажите корректный идентификатор IANA (например Europe/Moscow)."
            : "Не удалось сохранить.",
        );
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--patient-border)] pt-4 first:border-t-0 first:pt-0">
      <Label htmlFor="patient-calendar-tz" className={cn(patientMutedTextClass, "text-xs font-normal uppercase tracking-wide")}>
        Календарный пояс (IANA)
      </Label>
      <p className={cn(patientMutedTextClass, "text-xs")}>
        Для «чек-листа на сегодня» в программе лечения считаются локальные сутки в этом поясе. Пустое значение — общий пояс приложения.
      </p>
      <Input
        id="patient-calendar-tz"
        className="max-w-md text-sm"
        placeholder="Europe/Moscow"
        value={loading ? "" : value}
        onChange={(e) => setValue(e.target.value)}
        disabled={loading || saving}
        maxLength={120}
        autoComplete="off"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={loading || saving} onClick={() => void save()}>
          {saving ? "Сохранение…" : "Сохранить пояс"}
        </Button>
        {msg ? <span className="text-xs text-destructive">{msg}</span> : null}
      </div>
    </div>
  );
}
