'use client';

import { useId, useMemo, useState } from 'react';
import type {
  OrganizationSlugManagementState,
  OrganizationSlugMutationErrorCode,
} from '@/modules/clinic-directory/ports';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/doctor/primitives/dialog';
import { Input } from '@/shared/ui/doctor/primitives/input';

type ClinicSlugSectionProps = {
  initialState: OrganizationSlugManagementState;
  appBaseUrl: string;
};

type SlugApiResponse =
  | { ok: true; slug: string; state: OrganizationSlugManagementState }
  | {
      ok: false;
      error: OrganizationSlugMutationErrorCode | 'invalid_body' | 'directory_unavailable';
    };

type SlugApiErrorCode =
  OrganizationSlugMutationErrorCode | 'invalid_body' | 'directory_unavailable';

export function clinicSlugErrorMessage(error: SlugApiErrorCode) {
  switch (error) {
    case 'slug_unavailable':
      return 'Этот адрес уже занят. Выберите другой.';
    case 'slug_invalid_characters':
      return 'Используйте только латинские буквы, цифры и дефисы.';
    case 'slug_too_short':
      return 'Адрес должен содержать минимум 3 символа.';
    case 'slug_too_long':
      return 'Адрес должен быть не длиннее 63 символов.';
    case 'reserved_slug':
      return 'Этот адрес зарезервирован системой. Выберите другой.';
    case 'slug_unchanged':
      return 'Введите адрес, отличный от текущего.';
    case 'rename_confirmation_required':
      return 'Подтвердите переименование.';
    case 'self_rename_allowance_spent':
      return 'Адрес можно сменить самостоятельно один раз, и он уже сменён. Дальнейшую смену делает поддержка — напишите ей.';
    default:
      return 'Не удалось сохранить адрес. Повторите попытку.';
  }
}

export function ClinicSlugSection({ initialState, appBaseUrl }: ClinicSlugSectionProps) {
  const fieldId = useId();
  const confirmId = useId();
  const [state, setState] = useState(initialState);
  const [candidate, setCandidate] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const publicUrl = useMemo(
    () =>
      state.currentSlug
        ? `${appBaseUrl.replace(/\/$/, '')}/book/${encodeURIComponent(state.currentSlug)}`
        : null,
    [appBaseUrl, state.currentSlug],
  );

  async function saveSlug(irreversibleRenameConfirmed: boolean) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/clinic/slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: candidate,
          irreversibleRenameConfirmed,
        }),
      });
      const body = (await response.json()) as SlugApiResponse;
      if (!response.ok || !body.ok) {
        setError(clinicSlugErrorMessage(body.ok ? 'invalid_body' : body.error));
        return;
      }
      setState(body.state);
      setCandidate('');
      setConfirmed(false);
      setRenameOpen(false);
    } catch {
      setError('Не удалось сохранить адрес. Повторите попытку.');
    } finally {
      setPending(false);
    }
  }

  async function copyPublicUrl() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setCopyStatus('failed');
    }
  }

  const slugField = (
    <DoctorField
      label="Slug клиники"
      htmlFor={fieldId}
      hint="Латинские буквы, цифры и дефисы, от 3 до 63 символов."
    >
      <Input
        id={fieldId}
        value={candidate}
        onChange={(event) => setCandidate(event.currentTarget.value.toLowerCase())}
        placeholder="tochka-zdorovya"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={pending}
      />
    </DoctorField>
  );

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Публичная запись</DoctorSectionTitle>
      </DoctorSectionHeader>

      {state.currentSlug && publicUrl ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            Slug: <code className="font-mono">{state.currentSlug}</code>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm text-primary underline underline-offset-2"
            >
              {publicUrl}
            </a>
            <Button type="button" size="sm" variant="outline" onClick={() => void copyPublicUrl()}>
              {copyStatus === 'copied' ? 'Скопировано' : 'Скопировать'}
            </Button>
          </div>
          {copyStatus === 'failed' ? (
            <p role="alert" className="text-sm text-destructive">
              Не удалось скопировать ссылку.
            </p>
          ) : null}

          {state.selfRenameAllowed ? (
          <Dialog
            open={renameOpen}
            onOpenChange={(open) => {
              setRenameOpen(open);
              setError(null);
              if (!open) setConfirmed(false);
            }}
          >
            <DialogTrigger
              render={<Button type="button" size="sm" variant="outline" className="self-start" />}
            >
              Изменить адрес
            </DialogTrigger>
            <DialogContent className="sm:max-w-md" showCloseButton>
              <DialogHeader>
                <DialogTitle>Изменить адрес публичной записи</DialogTitle>
                <DialogDescription>
                  Старый адрес продолжит работать и навсегда останется за вашей клиникой — другой
                  клинике он не достанется никогда. При желании вы сможете вернуть его себе.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                {slugField}
                <label className="flex items-start gap-2 text-sm" htmlFor={confirmId}>
                  <Checkbox
                    id={confirmId}
                    checked={confirmed}
                    onCheckedChange={(checked) => setConfirmed(checked === true)}
                    disabled={pending}
                    className="mt-0.5"
                  />
                  <span>
                    Я понимаю: старый адрес останется за моей клиникой и другим не достанется.
                  </span>
                </label>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void saveSlug(true)}
                    disabled={pending || !confirmed}
                  >
                    {pending ? 'Сохранение…' : 'Переименовать'}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
          ) : (
            // Владелец 19.08: «уведомлять об этом специально нигде не надо» — поэтому здесь ровно
            // одна строка на месте кнопки, без баннера, письма и записи в журнале кабинета.
            <p className="text-sm text-muted-foreground">
              Самостоятельная смена адреса уже использована. Дальнейшую смену делает поддержка.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {slugField}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => void saveSlug(false)}
            disabled={pending}
          >
            {pending ? 'Сохранение…' : 'Создать адрес'}
          </Button>
        </div>
      )}
    </DoctorSection>
  );
}
