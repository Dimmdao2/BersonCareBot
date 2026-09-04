'use client';

/**
 * PatientTabAccount — 2026-09-04 mobile redesign (ACCOUNT/CONTACTS/ACCESS).
 *
 * Kept:
 *  1. Личные данные     — read-only canonical ФИО + дата рождения + пол; edit via standard modal
 *     (PATCH /api/doctor/patients/[userId]/fio — the same endpoint the old header inline-edit used).
 *  2. Контакты и каналы — only actually-existing contacts/bindings.
 *  3. Доступ к аккаунту — two equal-width Заблокировать/В архив buttons, no heading.
 *  4. Администрирование — AdminMergeAccountsPanel (collapsed by default) + audit log (admin-only,
 *     untouched — out of scope for this pass).
 *
 * Removed from here (moved to other tabs, pre-existing):
 *  - Сопровождение → PatientTabOverview
 *  - Платежи       → PatientTabRecords
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PatientCardHeader } from '@/modules/doctor-clients/ports';
import { Check, Mail, Pencil, Phone, Send } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { DoctorDatePicker } from '@/shared/ui/doctor/DoctorDatePicker';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorBodyTextClass,
  doctorMetaTextClass,
} from '@/shared/ui/doctor/doctorVisual';
import { cn } from '@/lib/utils';
import { formatDoctorFio } from '@/shared/lib/fio';
import { formatTelegramUsernameMention } from '@/modules/messaging/patientTelegramUsernameMention';
import { AdminMergeAccountsPanel } from '@/app/app/doctor/clients/AdminMergeAccountsPanel';
import { AdminClientAuditHistorySection } from '@/app/app/doctor/clients/AdminClientAuditHistorySection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  userId: string;
  header?: PatientCardHeader;
  /**
   * Whether the «Учётка» tab is the active tab. Tabs mount once on card load
   * (load-once + client-side switching), so admin-only fetches here (merge
   * candidates, audit log) must stay suspended until the tab is actually
   * opened — otherwise every patient-card view fires wasteful 403s for
   * non-admin doctor sessions.
   */
  active?: boolean;
  /** SSR-provided supplementary contacts. When present, skips SecondaryPhones initial fetch. */
  initialSupplementaryContacts?: SupplementaryContact[] | null;
  /** Hides the «Администрирование» section (UUID, Telegram ID, merge, audit) for non-admin doctors. */
  isAdmin?: boolean;
};

type Gender = 'male' | 'female';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fmtBirthDateDisplay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '—';
  return `${day}.${month}.${year}`;
}

function todayInputDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* silent */
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Section card wrapper with title row (ACCOUNT-02: shared section-title style). */
function SectionCard({
  title,
  titleRight,
  children,
  className,
}: {
  title?: string;
  titleRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(doctorSectionCardClass, className)}>
      {title || titleRight ? (
        <div className="flex items-center gap-2 flex-wrap">
          {title ? <span className={doctorSectionTitleClass}>{title}</span> : null}
          {titleRight && <span className="ml-auto">{titleRight}</span>}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Compact key–value table row */
function KVRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className={cn(doctorMetaTextClass, 'py-1 pr-3 w-[42%] align-top')}>{label}</td>
      <td className={cn(doctorBodyTextClass, 'py-1 align-top')}>{children}</td>
    </tr>
  );
}

/**
 * Channel binding row (CONTACTS-02..08): rendered ONLY for a channel that actually exists — no
 * placeholder "не привязан" rows. Confirmation is a compact check/label, never the word
 * «подключён» (CONTACTS-04), and there is no navigation chevron (CONTACTS-11).
 */
function ChannelRow({
  icon,
  label,
  value,
  confirmed,
  confirmedLabel = 'подтверждён',
  unconfirmedLabel = 'не подтверждён',
  blocked,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  /** undefined — channel has no confirmation concept (e.g. phone is the login identity itself). */
  confirmed?: boolean;
  confirmedLabel?: string;
  unconfirmedLabel?: string;
  /** CONTACTS-07: shown only when the caller passes an already-known true/false from the shared contract. */
  blocked?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-2.5 py-2">
      <span className="w-5 flex-none flex items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className={cn(doctorBodyTextClass, 'truncate leading-tight')}>{value}</div>
        <div className={cn(doctorMetaTextClass, 'flex items-center gap-1')}>
          <span>{label}</span>
          {confirmed === true ? (
            <span className="inline-flex items-center gap-0.5 text-primary">
              <Check className="size-3" aria-hidden />
              {confirmedLabel}
            </span>
          ) : confirmed === false ? (
            <span className="text-muted-foreground">{unconfirmedLabel}</span>
          ) : null}
          {blocked ? <span className="text-destructive">· бот заблокирован пациентом</span> : null}
        </div>
      </div>
      {actionLabel && (
        <Button
          type="button"
          variant="ghost"
          onClick={onAction}
          className="inline-flex h-6 items-center justify-center px-1.5 text-xs text-muted-foreground"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/** CONTACTS-06: Max has no brand icon in the shared icon set — the cabinet's accepted stand-in is a plain «M» monogram. */
function MaxMonogram() {
  return (
    <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[10px] font-semibold leading-none text-foreground">
      M
    </span>
  );
}

/**
 * Доп. телефоны пациента (платформенные доп. контакты, contact_type='phone').
 * Основной телефон не редактируется ни врачом, ни админом — здесь только ДОБАВЛЕНИЕ
 * вторичных номеров (owner-правило). Бэкенд: /api/doctor/clients/:id/supplementary-contacts.
 */
type SupplementaryContact = { id: string; contactType: string; value: string; source: string };

export type { SupplementaryContact };

function SecondaryPhones({
  userId,
  initialContacts,
}: {
  userId: string;
  /** SSR-provided contacts (all types). When present, skips the initial client fetch. */
  initialContacts?: SupplementaryContact[];
}) {
  // Filter to phones on init; client re-fetch returns all types so filter is applied there too.
  const [phones, setPhones] = useState<SupplementaryContact[] | null>(() =>
    initialContacts != null ? initialContacts.filter((c) => c.contactType === 'phone') : null,
  );
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/supplementary-contacts`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ contacts: SupplementaryContact[] }>) : null))
      .then((d) => {
        if (!d) {
          setError(true);
          setPhones([]);
          return;
        }
        setError(false);
        setPhones((d.contacts ?? []).filter((c) => c.contactType === 'phone'));
      })
      .catch(() => {
        setError(true);
        setPhones([]);
      });
  };

  useEffect(() => {
    // Skip initial fetch when SSR data provided; load() is still called after add/remove.
    if (initialContacts != null) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    const value = input.trim();
    if (!value) {
      setAddError('Введите номер');
      return;
    }
    setSaving(true);
    setAddError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/supplementary-contacts`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactType: 'phone', value }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setAddError(
          body?.error === 'matches_identity'
            ? 'Совпадает с основным телефоном'
            : body?.error === 'invalid_value'
              ? 'Некорректный номер'
              : 'Не удалось добавить',
        );
        return;
      }
      setInput('');
      setAdding(false);
      load();
    } catch {
      setAddError('Не удалось добавить');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const prev = phones;
    setPhones((list) => (list ? list.filter((p) => p.id !== id) : list));
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/supplementary-contacts/${encodeURIComponent(id)}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!res.ok) setPhones(prev ?? null);
    } catch {
      setPhones(prev ?? null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {phones?.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/10 px-2.5 py-2"
        >
          <span className="w-5 flex-none flex items-center justify-center text-muted-foreground">
            <Phone className="size-3.5" aria-hidden />
          </span>
          <span className={cn(doctorBodyTextClass, 'flex-1 min-w-0 truncate')}>{p.value}</span>
          <span className={doctorMetaTextClass}>доп. телефон</span>
          <Button
            type="button"
            variant="ghost"
            title="Удалить"
            onClick={() => remove(p.id)}
            className="h-6 w-6 p-0 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            ×
          </Button>
        </div>
      ))}

      {error && phones?.length === 0 && (
        <span className={cn(doctorMetaTextClass, 'text-destructive')}>
          Не удалось загрузить доп. телефоны.
        </span>
      )}

      {adding ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              } else if (e.key === 'Escape') {
                setAdding(false);
              }
            }}
            placeholder="+7 999 000-00-00"
            className="flex-1 text-sm"
          />
          <Button type="button" variant="default" onClick={() => void add()} disabled={saving}>
            {saving ? '…' : 'Добавить'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAdding(false)}
            disabled={saving}
            className="text-muted-foreground"
          >
            Отмена
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="link"
          onClick={() => setAdding(true)}
          className="self-start h-auto p-0 text-sm"
        >
          + доп. телефон
        </Button>
      )}
      {addError && (
        <span className={cn(doctorMetaTextClass, 'text-destructive')}>{addError}</span>
      )}
    </div>
  );
}

/**
 * Смена email пациента. Врач НЕ может менять email (owner-правило) — эндпоинт admin-only.
 * Родитель уже знает роль из SSR и монтирует компонент только для admin на активной вкладке.
 */
function EmailChange({ userId }: { userId: string }) {
  const [pending, setPending] = useState<{ email: string; expiresAt: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/doctor/patients/${userId}/email-change`;

  useEffect(() => {
    let alive = true;
    fetch(base, { credentials: 'include' })
      .then(async (r) => {
        if (!alive) return;
        if (!r.ok) return;
        const d = (await r.json()) as { pending: { email: string; expiresAt: string } | null };
        setPending(d.pending ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [base]);

  const submit = async () => {
    const email = input.trim();
    if (!email) {
      setError('Введите email');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(base, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => null)) as {
        pending?: { email: string; expiresAt: string };
        error?: string;
        message?: string;
      } | null;
      if (!res.ok) {
        setError(
          body?.message ?? (body?.error === 'invalid_body' ? 'Некорректный email' : 'Не удалось'),
        );
        return;
      }
      setPending(body?.pending ?? { email, expiresAt: '' });
      setInput('');
      setEditing(false);
    } catch {
      setError('Не удалось');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/10 px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        <span className="w-5 flex-none flex items-center justify-center text-muted-foreground">
          <Mail className="size-3.5" aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <div className={cn(doctorBodyTextClass, 'leading-tight')}>Смена email (админ)</div>
          {pending ? (
            <div className={doctorMetaTextClass}>
              ожидает подтверждения пациентом: <span className="font-mono">{pending.email}</span>
            </div>
          ) : (
            <div className={doctorMetaTextClass}>применится после подтверждения кодом пациентом</div>
          )}
        </div>
        {!editing && (
          <Button
            type="button"
            variant="link"
            onClick={() => setEditing(true)}
            className="flex-none h-auto p-0 text-sm"
          >
            {pending ? 'сменить другой' : 'сменить email'}
          </Button>
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            type="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              } else if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="новый email пациента"
            className="flex-1 text-sm"
          />
          <Button type="button" variant="default" onClick={() => void submit()} disabled={saving}>
            {saving ? '…' : 'Отправить код'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="text-muted-foreground"
          >
            Отмена
          </Button>
        </div>
      )}
      {error && <span className={cn(doctorMetaTextClass, 'text-destructive')}>{error}</span>}
    </div>
  );
}

/**
 * ACCOUNT-04/05: standard modal, not an inline form. Reuses the same
 * PATCH /api/doctor/patients/[userId]/fio contract the old header inline-edit used.
 */
function PersonalDataEditModal({
  open,
  onClose,
  userId,
  lastName,
  firstName,
  patronymic,
  birthDate,
  gender,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  lastName: string | null;
  firstName: string | null;
  patronymic: string | null;
  birthDate: string | null;
  gender: Gender | null;
  onSaved: () => void;
}) {
  const formId = 'patient-account-personal-data-form';
  const [draftLastName, setDraftLastName] = useState(lastName ?? '');
  const [draftFirstName, setDraftFirstName] = useState(firstName ?? '');
  const [draftPatronymic, setDraftPatronymic] = useState(patronymic ?? '');
  const [draftBirthDate, setDraftBirthDate] = useState(birthDate ?? '');
  const [draftGender, setDraftGender] = useState<Gender | ''>(gender ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed drafts from the latest saved values each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setDraftLastName(lastName ?? '');
    setDraftFirstName(firstName ?? '');
    setDraftPatronymic(patronymic ?? '');
    setDraftBirthDate(birthDate ?? '');
    setDraftGender(gender ?? '');
    setError(null);
  }, [open, lastName, firstName, patronymic, birthDate, gender]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/fio`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastName: draftLastName.trim() || null,
          firstName: draftFirstName.trim() || null,
          patronymic: draftPatronymic.trim() || null,
          birthDate: draftBirthDate.trim() || null,
          gender: draftGender || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        setError(body?.message ?? body?.error ?? 'Ошибка сохранения');
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError('Ошибка сети');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DoctorModal
      open={open}
      onClose={onClose}
      title="Личные данные"
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={doctorMetaTextClass} htmlFor="account-fio-last-name">
            Фамилия
          </label>
          <Input
            id="account-fio-last-name"
            value={draftLastName}
            onChange={(e) => setDraftLastName(e.target.value)}
            placeholder="Иванов"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={doctorMetaTextClass} htmlFor="account-fio-first-name">
            Имя
          </label>
          <Input
            id="account-fio-first-name"
            value={draftFirstName}
            onChange={(e) => setDraftFirstName(e.target.value)}
            placeholder="Иван"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={doctorMetaTextClass} htmlFor="account-fio-patronymic">
            Отчество
          </label>
          <Input
            id="account-fio-patronymic"
            value={draftPatronymic}
            onChange={(e) => setDraftPatronymic(e.target.value)}
            placeholder="Иванович"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={doctorMetaTextClass}>Дата рождения</span>
          {/* ACCOUNT-08: exact date, no month-only mode. */}
          <DoctorDatePicker
            value={draftBirthDate}
            onChange={setDraftBirthDate}
            placeholder="Не указана"
            max={todayInputDate()}
            ariaLabel="Дата рождения"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={doctorMetaTextClass}>Пол</span>
          <Select
            value={draftGender || undefined}
            onValueChange={(v) => setDraftGender(v as Gender)}
          >
            <SelectTrigger aria-label="Пол">
              <SelectValue placeholder="Не указан" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Мужской</SelectItem>
              <SelectItem value="female">Женский</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </DoctorModal>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PatientTabAccount({
  userId,
  header,
  active = false,
  initialSupplementaryContacts,
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const identity = header?.identity;

  // Derived channel info from header
  const hasTelegram = Boolean(identity?.bindings?.telegramId);
  const hasMax = Boolean(identity?.bindings?.maxId);
  const hasEmail = Boolean(identity?.email);
  const telegramBotBlocked = identity?.bindings?.telegramBotBlocked ?? false;
  const maxBotBlocked = identity?.bindings?.maxBotBlocked ?? false;
  const telegramMention = formatTelegramUsernameMention(identity?.telegramUsername ?? null);

  // Personal data — read-only display values from header
  const lastName = identity?.lastName ?? null;
  const firstName = identity?.firstName ?? null;
  const patronymic = identity?.patronymic ?? null;
  const birthDate = identity?.birthDate ?? null;
  const gender = identity?.gender ?? null;
  const fioDisplay = formatDoctorFio({ lastName, firstName, patronymic }, 'не указано');

  // CONTACTS-10: confirmed only after an actual successful code confirmation/login, never inferred
  // from "an email is on file" — the oracle is `emailVerifiedAt` (user_contacts.confirmed_at).
  const emailConfirmed = Boolean(identity?.emailVerifiedAt);

  const [personalDataModalOpen, setPersonalDataModalOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Block state (optimistic from header; confirmed by POST)
  // ---------------------------------------------------------------------------
  const [isBlocked, setIsBlocked] = useState(identity?.isBlocked ?? false);
  const [blockPending, setBlockPending] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  // Sync when header arrives
  useEffect(() => {
    if (identity?.isBlocked !== undefined) setIsBlocked(identity.isBlocked);
  }, [identity?.isBlocked]);

  async function handleBlockToggle() {
    const nextBlocked = !isBlocked;
    setBlockPending(true);
    setBlockError(null);
    // Optimistic
    setIsBlocked(nextBlocked);
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/block`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked: nextBlocked }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        // Rollback
        setIsBlocked(!nextBlocked);
        setBlockError(data.error ?? `Ошибка ${res.status}`);
      }
    } catch {
      setIsBlocked(!nextBlocked);
      setBlockError('network');
    } finally {
      setBlockPending(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Archive state (optimistic from header; confirmed by PATCH)
  // ---------------------------------------------------------------------------
  const [isArchived, setIsArchived] = useState(identity?.isArchived ?? false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archivePending, setArchivePending] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    if (identity?.isArchived !== undefined) setIsArchived(identity.isArchived);
  }, [identity?.isArchived]);

  async function handleArchiveToggle() {
    const nextArchived = !isArchived;
    setArchivePending(true);
    setArchiveError(null);
    setArchiveConfirm(false);
    setIsArchived(nextArchived); // optimistic
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/archive`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: nextArchived }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setIsArchived(!nextArchived); // rollback
        setArchiveError(data.error ?? `Ошибка ${res.status}`);
      }
    } catch {
      setIsArchived(!nextArchived);
      setArchiveError('network');
    } finally {
      setArchivePending(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Merge block collapse state
  // ---------------------------------------------------------------------------
  const [mergeOpen, setMergeOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
      {/* ====================================================================
          LEFT COLUMN
      ==================================================================== */}
      <div className="flex flex-col gap-3">
        {/* ── 1. Личные данные (read-only; edit via standard modal) ──── */}
        <SectionCard
          title="Личные данные"
          titleRight={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Редактировать личные данные"
              onClick={() => setPersonalDataModalOpen(true)}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          }
        >
          <table className="w-full border-separate border-spacing-0">
            <tbody>
              <KVRow label="ФИО">
                <span className="font-medium">{fioDisplay}</span>
              </KVRow>
              <KVRow label="Дата рождения">
                <span>{fmtBirthDateDisplay(birthDate)}</span>
              </KVRow>
              <KVRow label="Пол">
                <span>{gender === 'male' ? 'Мужской' : gender === 'female' ? 'Женский' : '—'}</span>
              </KVRow>
            </tbody>
          </table>
        </SectionCard>

        {/* ── 2. Контакты и каналы ─────────────────────────────────── */}
        <SectionCard title="Контакты и каналы">
          <div className="flex flex-col gap-1.5">
            {/* Основной телефон — всегда есть (это identity), не редактируется. */}
            <ChannelRow
              icon={<Phone className="size-3.5" aria-hidden />}
              label="Основной телефон"
              value={identity?.phone ?? '—'}
              actionLabel="⧉"
              onAction={() => void copyText(identity?.phone ?? '')}
            />

            {/* Доп. телефоны (основной не меняется; только добавление вторичных) */}
            <SecondaryPhones
              userId={userId}
              initialContacts={initialSupplementaryContacts ?? undefined}
            />

            {/* Telegram — только если реально привязан (CONTACTS-02) */}
            {hasTelegram ? (
              <ChannelRow
                icon={<Send className="size-3.5" aria-hidden />}
                label="Telegram"
                value={telegramMention ?? 'привязан'}
                blocked={telegramBotBlocked}
              />
            ) : null}

            {/* MAX — только если реально привязан; буква «M», не иконка телефона (CONTACTS-06) */}
            {hasMax ? (
              <ChannelRow
                icon={<MaxMonogram />}
                label="MAX"
                value="привязан"
                blocked={maxBotBlocked}
              />
            ) : null}

            {/* Email — показан, если контакт есть (независимо от подтверждения) */}
            {hasEmail ? (
              <ChannelRow
                icon={<Mail className="size-3.5" aria-hidden />}
                label="Email"
                value={identity?.email ?? '—'}
                confirmed={emailConfirmed}
              />
            ) : null}

            {/* Смена email — только админ, применяется после подтверждения кодом пациентом */}
            {isAdmin && active ? <EmailChange userId={userId} /> : null}
          </div>
        </SectionCard>
      </div>

      {/* ====================================================================
          RIGHT COLUMN
      ==================================================================== */}
      <div className="flex flex-col gap-3">
        {/* ── 3. Доступ к аккаунту (ACCESS-01..04) ─────────────────── */}
        <SectionCard>
          {isBlocked && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2">
              <span className="text-destructive flex-none font-bold">✕</span>
              <span className={cn(doctorBodyTextClass, 'text-destructive font-medium')}>
                Пациент заблокирован
              </span>
            </div>
          )}

          {/* Two equal-width buttons: Заблокировать | В архив (ACCESS-03) */}
          {!archiveConfirm ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={isBlocked ? 'destructive' : 'outline'}
                disabled={blockPending}
                onClick={() => void handleBlockToggle()}
                className={cn(
                  isBlocked &&
                    'bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/40',
                )}
              >
                {blockPending ? '…' : isBlocked ? 'Снять блокировку' : 'Заблокировать'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={archivePending}
                onClick={() => setArchiveConfirm(true)}
                className={cn(
                  isArchived && 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20',
                )}
              >
                {archivePending ? '…' : isArchived ? 'Вернуть из архива' : 'В архив'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={cn(doctorBodyTextClass, 'text-destructive')}>
                Перенести в архив?
              </span>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleArchiveToggle()}
                className="ml-auto"
              >
                Да
              </Button>
              <Button type="button" variant="outline" onClick={() => setArchiveConfirm(false)}>
                Отмена
              </Button>
            </div>
          )}

          {blockError && (
            <p className={cn(doctorMetaTextClass, 'text-destructive')}>
              Блокировка: {blockError}
            </p>
          )}
          {archiveError && (
            <p className={cn(doctorMetaTextClass, 'text-destructive')}>Архив: {archiveError}</p>
          )}
        </SectionCard>

        {/* ── 4. Администрирование (не в скоупе этой правки) ──────── */}
        {isAdmin && (
          <SectionCard title="Администрирование">
            <table className="w-full border-separate border-spacing-0 mb-1">
              <tbody>
                <KVRow label="ID пациента">
                  <span className="font-mono text-xs">
                    {userId.slice(0, 12)}…{userId.slice(-4)}{' '}
                    <Button
                      type="button"
                      variant="ghost"
                      title="Скопировать"
                      onClick={() => void copyText(userId)}
                      className="inline-flex h-4 w-4 text-[10px] ml-0.5 align-middle p-0"
                    >
                      ⧉
                    </Button>
                  </span>
                </KVRow>
              </tbody>
            </table>

            {/* Merge — collapsible, suspended until opened */}
            <details
              open={mergeOpen}
              onToggle={(e) => setMergeOpen((e.currentTarget as HTMLDetailsElement).open)}
              className="group"
            >
              <summary className="flex cursor-pointer list-none items-center gap-1 py-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
                  Объединение (merge)
                </p>
                <span className="ml-auto text-[10px] text-muted-foreground/60 select-none">
                  {mergeOpen ? '▾' : '▸'}
                </span>
              </summary>
              <div className="mt-1">
                <AdminMergeAccountsPanel
                  anchorUserId={userId}
                  enabled
                  suspendHeavyFetch={!active || !mergeOpen}
                />
              </div>
            </details>

            {/* Audit log — AdminClientAuditHistorySection (handles 403 gracefully) */}
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-2">
              История изменений (audit)
            </p>
            <AdminClientAuditHistorySection platformUserId={userId} enabled suspendLoad={!active} />
          </SectionCard>
        )}
      </div>

      <PersonalDataEditModal
        open={personalDataModalOpen}
        onClose={() => setPersonalDataModalOpen(false)}
        userId={userId}
        lastName={lastName}
        firstName={firstName}
        patronymic={patronymic}
        birthDate={birthDate}
        gender={gender}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
