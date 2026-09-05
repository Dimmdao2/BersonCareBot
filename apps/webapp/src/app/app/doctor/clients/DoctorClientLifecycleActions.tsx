'use client';

import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { cn } from '@/lib/utils';
import {
  doctorClientOverviewPrimaryCardClass,
  doctorClientSectionTitleClass,
} from './doctorClientCardChrome';

type Props = {
  userId: string;
  isArchived: boolean;
};

export function DoctorClientLifecycleActions({ userId, isArchived }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'archive' | 'unarchive' | null>(null);

  async function archiveClient() {
    if (
      !window.confirm(
        'Переместить клиента в архив?\n\n' +
          'Карточка исчезнет из обычных списков, но её можно будет вернуть из архива.',
      )
    ) {
      return;
    }
    setBusy('archive');
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error('Не удалось архивировать. Попробуйте снова или обратитесь к администратору.');
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function unarchiveClient() {
    if (!window.confirm('Вернуть клиента из архива в обычные списки?')) return;
    setBusy('unarchive');
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        toast.error('Не удалось снять архив.');
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className={cn(doctorClientOverviewPrimaryCardClass, 'border-amber-500/30')}
      aria-labelledby="doctor-client-lifecycle-heading"
    >
      <h2 id="doctor-client-lifecycle-heading" className={doctorClientSectionTitleClass}>
        Учётная запись
      </h2>
      <p className="text-muted-foreground text-sm">
        Архивирование скрывает карточку из обычных списков и не удаляет данные клиента.
      </p>
      <div className="flex flex-wrap gap-2">
        {!isArchived ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void archiveClient()}
            id="doctor-client-archive-btn"
          >
            {busy === 'archive' ? '…' : 'В архив'}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void unarchiveClient()}
            id="doctor-client-unarchive-btn"
          >
            {busy === 'unarchive' ? '…' : 'Вернуть из архива'}
          </Button>
        )}
      </div>
    </section>
  );
}
