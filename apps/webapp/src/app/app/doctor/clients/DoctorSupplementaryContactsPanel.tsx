'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, MessageCircle, Phone, Send, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import type { DoctorSupplementaryContact } from '@/modules/platform-user-contacts/bookingContactUpsert';
import type { PlatformUserContactType } from '@/modules/platform-user-contacts/types';
import { phoneToTelHref } from '@/shared/lib/phoneLinks';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';

const CONTACT_TYPE_OPTIONS: { value: PlatformUserContactType; label: string }[] = [
  { value: 'phone', label: 'Телефон' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'max', label: 'MAX' },
];

type Props = {
  userId: string;
  initialContacts: DoctorSupplementaryContact[];
  onContactsChange?: (contacts: DoctorSupplementaryContact[]) => void;
};

function safeExternalContactHref(contact: DoctorSupplementaryContact): string | null {
  const value = contact.value.trim();
  if (contact.contactType === 'phone') return phoneToTelHref(value);
  if (contact.contactType === 'email') return `mailto:${value}`;
  if (contact.contactType === 'whatsapp') {
    const digits = value.replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}` : null;
  }

  const directUrl = (() => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return null;
      if (contact.contactType === 'telegram' && ['t.me', 'telegram.me'].includes(url.hostname)) {
        return url.toString();
      }
      if (contact.contactType === 'max' && url.hostname === 'max.ru') return url.toString();
      if (contact.contactType === 'vk' && ['vk.com', 'www.vk.com'].includes(url.hostname)) {
        return url.toString();
      }
      if (contact.contactType === 'other') return url.toString();
    } catch {
      return null;
    }
    return null;
  })();
  if (directUrl) return directUrl;

  const handle = value.replace(/^@/, '');
  if (!/^(?=.*[A-Za-z_])[A-Za-z0-9_-]{3,64}$/.test(handle)) return null;
  if (contact.contactType === 'telegram') return `https://t.me/${handle}`;
  if (contact.contactType === 'max') return `https://max.ru/${handle}`;
  if (contact.contactType === 'vk') return `https://vk.com/${handle}`;
  return null;
}

function contactIcon(contactType: string) {
  if (contactType === 'phone') return <Phone className="size-4" aria-hidden />;
  if (contactType === 'email') return <Mail className="size-4" aria-hidden />;
  if (contactType === 'telegram') return <Send className="size-4" aria-hidden />;
  if (contactType === 'max') {
    return (
      <span className="text-xs font-semibold" aria-hidden>
        M
      </span>
    );
  }
  return <MessageCircle className="size-4" aria-hidden />;
}

export function DoctorSupplementaryContactsList({
  contacts,
  deletingId,
  onDelete,
}: {
  contacts: DoctorSupplementaryContact[];
  deletingId?: string | null;
  onDelete?: (contactId: string) => void;
}) {
  if (contacts.length === 0) {
    return <p className="text-sm text-muted-foreground">Дополнительных контактов нет</p>;
  }
  return (
    <ul id="doctor-client-supplementary-contacts-list" className="m-0 list-none space-y-1.5 p-0">
      {contacts.map((contact) => {
        const href = safeExternalContactHref(contact);
        const value = (
          <>
            <span className="flex size-5 shrink-0 items-center justify-center text-primary">
              {contactIcon(contact.contactType)}
            </span>
            <span className="min-w-0 flex-1 truncate">{contact.value}</span>
          </>
        );
        return (
          <li key={contact.id} className="flex items-center gap-2">
            {href ? (
              <a
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel={href.startsWith('http') ? 'noreferrer' : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-primary hover:bg-primary/10"
              >
                {value}
              </a>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-foreground">
                {value}
              </span>
            )}
            {onDelete && (contact.source === 'doctor' || contact.source === 'admin') ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Удалить контакт"
                disabled={deletingId === contact.id}
                onClick={() => onDelete(contact.id)}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function DoctorSupplementaryContactsPanel({
  userId,
  initialContacts,
  onContactsChange,
}: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [contactType, setContactType] = useState<PlatformUserContactType>('phone');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContacts(initialContacts);
    onContactsChange?.(initialContacts);
  }, [initialContacts, onContactsChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/supplementary-contacts`,
      );
      const data = (await res.json()) as { ok?: boolean; contacts?: DoctorSupplementaryContact[] };
      if (!res.ok || !data.ok) {
        setError('Не удалось загрузить контакты');
        return;
      }
      setContacts(data.contacts ?? []);
      onContactsChange?.(data.contacts ?? []);
    } finally {
      setLoading(false);
    }
  }, [onContactsChange, userId]);

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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactType, value: trimmed }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        if (data.error === 'matches_identity') {
          setError('Совпадает с основным контактом учётной записи');
        } else if (data.error === 'invalid_value') {
          setError('Некорректное значение');
        } else {
          setError('Не удалось сохранить');
        }
        return;
      }
      setValue('');
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
        { method: 'DELETE' },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        if (data.error === 'delete_not_allowed') {
          setError('Нельзя удалить автоматически сохранённый контакт');
        } else {
          setError('Не удалось удалить');
        }
        return;
      }
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {loading ? <DoctorPanelLoading className="py-6" /> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DoctorSupplementaryContactsList
        contacts={contacts}
        deletingId={deletingId}
        onDelete={(contactId) => void onDelete(contactId)}
      />
      <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Select
          value={contactType}
          onValueChange={(v) => setContactType(v as PlatformUserContactType)}
        >
          <SelectTrigger
            className="w-full sm:w-[9rem]"
            displayLabel={
              CONTACT_TYPE_OPTIONS.find((option) => option.value === contactType)?.label
            }
          >
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
          {saving ? '…' : 'Добавить'}
        </Button>
      </form>
    </div>
  );
}
