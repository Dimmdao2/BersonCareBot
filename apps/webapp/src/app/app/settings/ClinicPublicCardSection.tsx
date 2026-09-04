'use client';

import { useId, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CLINIC_PUBLIC_CARD_LIMITS,
  type ClinicPublicCardSettings,
} from '@/modules/clinic-public-card/ports';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { MediaPickerShell } from '@/shared/ui/doctor/media/MediaPickerShell';
import { MediaPickerPanel } from '@/shared/ui/doctor/media/MediaPickerPanel';
import type { MediaListItem } from '@/shared/ui/doctor/media/MediaPickerList';
import { patchAdminSettingWithResult } from './patchAdminSetting';

type Props = {
  initialSettings: ClinicPublicCardSettings;
  skipPublicCardAtRoot: boolean;
  /** Live page address, or `null` while the clinic has no slug yet. */
  publicUrl: string | null;
};

export function clinicPublicCardErrorMessage(code: string): string {
  switch (code) {
    case 'description_too_long':
      return `Описание длиннее ${CLINIC_PUBLIC_CARD_LIMITS.descriptionMaxLength} символов.`;
    case 'phone_too_long':
      return 'Телефон слишком длинный.';
    case 'email_too_long':
      return 'E-mail слишком длинный.';
    case 'website_too_long':
      return 'Адрес сайта слишком длинный.';
    case 'website_invalid':
      return 'Проверьте адрес сайта.';
    case 'too_many_photos':
      return `Не больше ${CLINIC_PUBLIC_CARD_LIMITS.maxPhotos} фотографий.`;
    case 'duplicate_photo':
      return 'Одна и та же фотография добавлена дважды.';
    case 'media_not_owned':
      return 'Этот файл не принадлежит вашей клинике.';
    default:
      return 'Не удалось сохранить страницу. Повторите попытку.';
  }
}

/**
 * Clinic-admin editing surface of the public card (plan §4).
 *
 * What is deliberately NOT here: a page builder, blocks, section order, HTML/markdown, themes,
 * colours, specialist names. The owner asked for a card, not a page editor. Branch addresses are
 * not a form field either — they are snapshotted from the branches the clinic already maintains,
 * so an address never gets a second home that drifts from the first.
 */
export function ClinicPublicCardSection({
  initialSettings,
  skipPublicCardAtRoot: initialSkipPublicCardAtRoot,
  publicUrl,
}: Props) {
  const descriptionId = useId();
  const phoneId = useId();
  const emailId = useId();
  const websiteId = useId();
  const publishId = useId();
  const rootEntryId = useId();

  const [settings, setSettings] = useState(initialSettings);
  const [pending, setPending] = useState(false);
  const [skipPublicCardAtRoot, setSkipPublicCardAtRoot] = useState(initialSkipPublicCardAtRoot);
  const [savingRootEntry, setSavingRootEntry] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

  function patch(next: Partial<ClinicPublicCardSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  async function save() {
    setPending(true);
    try {
      const response = await fetch('/api/clinic/public-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const body = (await response.json()) as
        | { ok: true; settings: ClinicPublicCardSettings }
        | { ok: false; error: string };
      if (!response.ok || !body.ok) {
        toast.error(clinicPublicCardErrorMessage(body.ok ? 'invalid_body' : body.error));
        return;
      }
      setSettings(body.settings);
      toast.success('Сохранено');
    } catch {
      toast.error('Не удалось сохранить страницу. Повторите попытку.');
    } finally {
      setPending(false);
    }
  }

  async function saveRootEntry(next: boolean) {
    const previous = skipPublicCardAtRoot;
    setSkipPublicCardAtRoot(next);
    setSavingRootEntry(true);
    const result = await patchAdminSettingWithResult('clinic_root_skip_public_card', next);
    if (!result.ok) {
      setSkipPublicCardAtRoot(previous);
      toast.error('Не удалось сохранить настройку входа. Повторите попытку.');
    }
    setSavingRootEntry(false);
  }

  const photosFull = settings.photoMediaIds.length >= CLINIC_PUBLIC_CARD_LIMITS.maxPhotos;

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Страница клиники</DoctorSectionTitle>
      </DoctorSectionHeader>

      <div className="flex flex-col gap-4">
        {publicUrl ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit break-all text-sm text-primary underline underline-offset-2"
          >
            {publicUrl}
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">
            Сначала задайте адрес клиники в разделе «Публичная запись».
          </p>
        )}

        <DoctorField
          label="Описание"
          htmlFor={descriptionId}
          hint={`Обычный текст, до ${CLINIC_PUBLIC_CARD_LIMITS.descriptionMaxLength} символов.`}
        >
          <Textarea
            id={descriptionId}
            rows={6}
            value={settings.description ?? ''}
            maxLength={CLINIC_PUBLIC_CARD_LIMITS.descriptionMaxLength}
            onChange={(event) => patch({ description: event.currentTarget.value })}
            disabled={pending}
          />
        </DoctorField>

        <DoctorField label="Телефон" htmlFor={phoneId}>
          <Input
            id={phoneId}
            value={settings.publicContactPhone ?? ''}
            onChange={(event) => patch({ publicContactPhone: event.currentTarget.value })}
            disabled={pending}
          />
        </DoctorField>

        <DoctorField label="E-mail" htmlFor={emailId}>
          <Input
            id={emailId}
            type="email"
            value={settings.publicContactEmail ?? ''}
            onChange={(event) => patch({ publicContactEmail: event.currentTarget.value })}
            disabled={pending}
          />
        </DoctorField>

        <DoctorField label="Сайт" htmlFor={websiteId}>
          <Input
            id={websiteId}
            value={settings.publicWebsiteUrl ?? ''}
            onChange={(event) => patch({ publicWebsiteUrl: event.currentTarget.value })}
            disabled={pending}
          />
        </DoctorField>

        <DoctorField label="Логотип" hint="Картинка, до готовности конвертации не показывается.">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {settings.logoMediaId ? 'Логотип выбран' : 'Логотип не выбран'}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setLogoPickerOpen(true)}
            >
              Установить
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || !settings.logoMediaId}
              onClick={() => patch({ logoMediaId: null })}
            >
              Очистить
            </Button>
          </div>
        </DoctorField>

        <DoctorField
          label="Фотографии"
          hint={`Картинки, не больше ${CLINIC_PUBLIC_CARD_LIMITS.maxPhotos}.`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Выбрано: {settings.photoMediaIds.length}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || photosFull}
              onClick={() => setPhotoPickerOpen(true)}
            >
              Добавить
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || settings.photoMediaIds.length === 0}
              onClick={() => patch({ photoMediaIds: [] })}
            >
              Очистить
            </Button>
          </div>
        </DoctorField>

        <label className="flex items-start gap-2 text-sm" htmlFor={publishId}>
          <Checkbox
            id={publishId}
            checked={settings.cardIsPublished}
            onCheckedChange={(checked) => patch({ cardIsPublished: checked === true })}
            disabled={pending}
            className="mt-0.5"
          />
          <span>Показывать страницу клиники</span>
        </label>

        <label className="flex items-start gap-2 text-sm" htmlFor={rootEntryId}>
          <Checkbox
            id={rootEntryId}
            checked={skipPublicCardAtRoot}
            onCheckedChange={(checked) => void saveRootEntry(checked === true)}
            disabled={pending || savingRootEntry}
            className="mt-0.5"
          />
          <span>Сразу открывать вход на брендированном адресе</span>
        </label>


        <Button type="button" size="sm" className="self-start" disabled={pending} onClick={() => void save()}>
          {pending ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </div>

      <MediaPickerShell title="Логотип клиники" open={logoPickerOpen} onOpenChange={setLogoPickerOpen}>
        <MediaPickerPanel
          key={logoPickerOpen ? 'clinic-card-logo-open' : 'clinic-card-logo-closed'}
          open={logoPickerOpen}
          apiKind="image"
          kind="image"
          folderId={undefined}
          onPick={(item: MediaListItem) => {
            patch({ logoMediaId: item.id });
            setLogoPickerOpen(false);
          }}
          exercisePicker={false}
          onPickerFolderIdChange={() => {}}
          showSort={false}
          showFolderScope={false}
        />
      </MediaPickerShell>

      <MediaPickerShell
        title="Фотографии клиники"
        open={photoPickerOpen}
        onOpenChange={setPhotoPickerOpen}
      >
        <MediaPickerPanel
          key={photoPickerOpen ? 'clinic-card-photo-open' : 'clinic-card-photo-closed'}
          open={photoPickerOpen}
          apiKind="image"
          kind="image"
          folderId={undefined}
          onPick={(item: MediaListItem) => {
            setSettings((current) =>
              current.photoMediaIds.includes(item.id) ||
              current.photoMediaIds.length >= CLINIC_PUBLIC_CARD_LIMITS.maxPhotos
                ? current
                : { ...current, photoMediaIds: [...current.photoMediaIds, item.id] },
            );
            setPhotoPickerOpen(false);
          }}
          exercisePicker={false}
          onPickerFolderIdChange={() => {}}
          showSort={false}
          showFolderScope={false}
        />
      </MediaPickerShell>
    </DoctorSection>
  );
}
