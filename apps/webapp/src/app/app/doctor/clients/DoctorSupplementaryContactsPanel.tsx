"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DoctorSupplementaryContact } from "@/modules/platform-user-contacts/bookingContactUpsert";
import type { PlatformUserContactType } from "@/modules/platform-user-contacts/types";
import { phoneToTelHref } from "@/shared/lib/phoneLinks";

const CONTACT_TYPE_OPTIONS: { value: PlatformUserContactType; label: string }[] = [
  { value: "phone", label: "Телефон" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
];

type Props = {
  userId: string;
  initialContacts: DoctorSupplementaryContact[];
};

export function DoctorSupplementaryContactsPanel({ userId, initialContacts }: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [contactType, setContactType] = useState<PlatformUserContactType>("phone");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContacts(initialContacts);
  }, [initialContacts]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/supplementary-contacts`,
      );
      const data = (await res.json()) as { ok?: boolean; contacts?: DoctorSupplementaryContact[] };
      if (!res.ok || !data.ok) {
        setError("Не удалось загрузить контакты");
        return;
      }
      setContacts(data.contacts ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/supplementary-contacts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactType, value: trimmed }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        if (data.error === "matches_identity") {
          setError("Совпадает с основным контактом учётной записи");
        } else if (data.error === "invalid_value") {
          setError("Некорректное значение");
        } else {
          setError("Не удалось сохранить");
        }
        return;
      }
      setValue("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(contactId: string) {
    setDeletingId(contactId);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/supplementary-contacts/${encodeURIComponent(contactId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        if (data.error === "delete_not_allowed") {
          setError("Нельзя удалить автоматически сохранённый контакт");
        } else {
          setError("Не удалось удалить");
        }
        return;
      }
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  const typeLabel = CONTACT_TYPE_OPTIONS.find((o) => o.value === contactType)?.label;

  return (
    <div className="flex flex-col gap-2">
      {loading ? <p className="text-sm text-muted-foreground">Загрузка…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {contacts.length > 0 ? (
        <ul id="doctor-client-supplementary-contacts-list" className="m-0 list-none space-y-1 p-0">
          {contacts.map((contact) => {
            const telHref =
              contact.contactType === "phone" || contact.contactType === "whatsapp"
                ? phoneToTelHref(contact.value)
                : null;
            return (
              <li key={contact.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  {contact.contactType === "email" ? (
                    <a href={`mailto:${contact.value}`} className="font-medium text-primary underline">
                      {contact.value}
                    </a>
                  ) : telHref ? (
                    <a href={telHref} className="font-medium text-primary underline">
                      {contact.value}
                    </a>
                  ) : (
                    contact.value
                  )}
                </span>
                {contact.source === "doctor" || contact.source === "admin" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label="Удалить контакт"
                    disabled={deletingId === contact.id}
                    onClick={() => void onDelete(contact.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Select value={contactType} onValueChange={(v) => setContactType(v as PlatformUserContactType)}>
          <SelectTrigger className="w-full sm:w-[9rem]" displayLabel={typeLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTACT_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
          className="min-w-0 flex-1"
          maxLength={500}
          autoComplete="off"
        />
        <Button type="submit" disabled={saving || !value.trim()} className="shrink-0">
          {saving ? "…" : "Добавить"}
        </Button>
      </form>
    </div>
  );
}
