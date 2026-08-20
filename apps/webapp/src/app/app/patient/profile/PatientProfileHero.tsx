'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/patient/primitives/button';
import { Input } from '@/shared/ui/patient/primitives/input';
import { routePaths } from '@/app-layer/routes/paths';
import { EmailAccountPanel } from '@/shared/ui/patient/EmailAccountPanel';
import {
  patientHeroBookingSectionClass,
  patientMutedTextClass,
} from '@/shared/ui/patient/patientVisual';
import { cn } from '@/lib/utils';
import {
  FIO_LATIN_REJECTED_TEXT,
  formatDoctorFio,
  isCyrillicFioInput,
  isCyrillicFioInputOrEmpty,
  normalizeFioPart,
  type StructuredFio,
} from '@/shared/lib/fio';

type Props = {
  displayName: string;
  initialFio: StructuredFio;
  phone: string | null;
  supportContactHref: string;
  fallbackDisplayName: string;
  initialEmail: string | null;
  emailVerified: boolean;
};

export function PatientProfileHero({
  displayName,
  initialFio,
  phone,
  supportContactHref,
  fallbackDisplayName,
  initialEmail,
  emailVerified,
}: Props) {
  const router = useRouter();
  const [persistedFio, setPersistedFio] = useState(initialFio);
  const [fioDraft, setFioDraft] = useState(initialFio);
  const [editingFio, setEditingFio] = useState(false);
  const [savingFio, setSavingFio] = useState(false);

  const goToBindPhone = () => {
    router.push(
      `${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.profile)}&mode=replace`,
    );
  };

  async function saveFio() {
    const lastName = normalizeFioPart(fioDraft.lastName);
    const firstName = normalizeFioPart(fioDraft.firstName);
    const patronymic = normalizeFioPart(fioDraft.patronymic);
    if (!lastName || !firstName) {
      toast.error('Укажите фамилию и имя');
      return;
    }
    if (
      !isCyrillicFioInput(lastName) ||
      !isCyrillicFioInput(firstName) ||
      !isCyrillicFioInputOrEmpty(patronymic ?? '')
    ) {
      toast.error(FIO_LATIN_REJECTED_TEXT);
      return;
    }
    setSavingFio(true);
    try {
      const response = await fetch('/api/patient/profile/fio', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lastName, firstName, patronymic }),
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; fio?: StructuredFio; error?: string }
        | null;
      if (!response.ok || !result?.ok || !result.fio) {
        toast.error(result?.error ?? 'Не удалось сохранить');
        return;
      }
      setPersistedFio(result.fio);
      setFioDraft(result.fio);
      setEditingFio(false);
    } catch {
      toast.error('Не удалось сохранить');
    } finally {
      setSavingFio(false);
    }
  }

  return (
    <section className={patientHeroBookingSectionClass}>
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className={cn(patientMutedTextClass, 'text-xs font-normal uppercase tracking-wide')}>
              ФИО
            </p>
            <Button type="button" variant="link" size="sm" className="h-auto min-h-0 px-0 py-0" onClick={() => {
              setFioDraft(persistedFio);
              setEditingFio((value) => !value);
            }}>
              {editingFio ? 'Отмена' : 'Изменить'}
            </Button>
          </div>
          {editingFio ? (
            <div className="grid gap-2">
              <Input aria-label="Фамилия" required value={fioDraft.lastName ?? ''} onChange={(event) => setFioDraft((value) => ({ ...value, lastName: event.target.value }))} />
              <Input aria-label="Имя" required value={fioDraft.firstName ?? ''} onChange={(event) => setFioDraft((value) => ({ ...value, firstName: event.target.value }))} />
              <Input aria-label="Отчество" value={fioDraft.patronymic ?? ''} onChange={(event) => setFioDraft((value) => ({ ...value, patronymic: event.target.value }))} />
              <Button type="button" size="sm" disabled={savingFio} onClick={() => void saveFio()}>Сохранить</Button>
            </div>
          ) : (
            <p className="text-sm text-[var(--patient-text-primary)]">
              {formatDoctorFio(persistedFio, displayName || fallbackDisplayName)}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 border-t border-[var(--patient-border)] pt-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span
              className={cn(patientMutedTextClass, 'text-xs font-normal uppercase tracking-wide')}
            >
              Телефон
            </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-primary h-auto min-h-0 px-0 py-0 text-sm font-normal"
              onClick={goToBindPhone}
            >
              {phone ? 'Изменить' : 'Привязать'}
            </Button>
          </div>
          {phone ? <p className="text-sm text-[var(--patient-text-primary)]">{phone}</p> : null}
        </div>

        <EmailAccountPanel
          initialEmail={initialEmail}
          emailVerified={emailVerified}
          supportContactHref={supportContactHref}
          layout="profileHero"
        />
      </div>
    </section>
  );
}
