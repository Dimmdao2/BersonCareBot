"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, Suspense, useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PatientBindPhoneClient } from "@/app/app/patient/bind-phone/PatientBindPhoneClient";
import { EmailAccountPanel } from "@/shared/ui/EmailAccountPanel";
import { InlineEditField } from "@/shared/ui/InlineEditField";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { updateDisplayName } from "./actions";

type Props = {
  displayName: string;
  phone: string | null;
  telegramId: string;
  maxId: string;
  supportContactHref: string;
  initialEmail: string | null;
  emailVerified: boolean;
};

export function ProfileForm({
  displayName,
  phone,
  telegramId,
  maxId,
  supportContactHref,
  initialEmail,
  emailVerified,
}: Props) {
  const router = useRouter();
  const [editingPhone, setEditingPhone] = useState(false);
  const phoneAtEditStartRef = useRef<string | null>(null);

  const handleSaveName = async (next: string) => {
    const trimmedName = next.trim();
    if (!trimmedName || trimmedName === displayName) return;
    await updateDisplayName(trimmedName);
    router.refresh();
  };

  useEffect(() => {
    if (!editingPhone || phone == null) return;
    const start = phoneAtEditStartRef.current;
    if (start != null && phone !== start) {
      startTransition(() => {
        setEditingPhone(false);
        phoneAtEditStartRef.current = null;
      });
    }
  }, [editingPhone, phone]);

  const beginPhoneEdit = () => {
    phoneAtEditStartRef.current = phone;
    setEditingPhone(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <InlineEditField
        label="ФИО"
        value={displayName}
        placeholder="Иванов Иван Иванович"
        type="text"
        emptyLabel="не указано"
        onSave={handleSaveName}
      />

      <div className="flex flex-col gap-1 border-t border-[var(--patient-border)] pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Телефон</span>
          {!phone ? (
            <Link
              href="/app/patient/bind-phone?next=/app/patient/profile"
              className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto min-h-0 px-0")}
            >
              Привязать номер
            </Link>
          ) : !editingPhone ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-primary h-auto min-h-0 px-0 py-0 text-sm font-medium"
              onClick={beginPhoneEdit}
            >
              Изменить
            </Button>
          ) : null}
        </div>
        {phone && !editingPhone ? (
          <p className="text-sm">{phone}</p>
        ) : null}
        {phone && editingPhone ? (
          <div className="flex flex-col gap-2 sm:max-w-md">
            <Suspense fallback={<p className={patientMutedTextClass}>Загрузка…</p>}>
              <PatientBindPhoneClient
                telegramId={telegramId}
                maxId={maxId}
                supportContactHref={supportContactHref}
                hint="Чтобы обновить номер, подтвердите новый контакт в Telegram или Max. SMS в профиле не используется."
              />
            </Suspense>
            <Button
              type="button"
              variant="link"
              className={cn(patientMutedTextClass, "h-auto min-h-0 px-0")}
              onClick={() => {
                phoneAtEditStartRef.current = null;
                setEditingPhone(false);
              }}
            >
              Отмена
            </Button>
          </div>
        ) : null}
      </div>

      <PatientCalendarTimezoneSection />

      <EmailAccountPanel
        initialEmail={initialEmail}
        emailVerified={emailVerified}
        supportContactHref={supportContactHref}
      />
    </div>
  );
}

function PatientCalendarTimezoneSection() {
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
    <div className="flex flex-col gap-2 border-t border-[var(--patient-border)] pt-4">
      <Label htmlFor="patient-calendar-tz" className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>
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
