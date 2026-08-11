'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { OrgBrandLogoControl, type OrgBrandLogoChange } from './OrgBrandLogoControl';
import { saveOrgBranding } from './brandingActions';

type Props = {
  brandingMutationAvailable: boolean;
  /** Canonical organization name — never gated by the paid mechanic, always defined (§3.4). */
  coreDisplayName: string;
  /** Currently published paid name override, or `null` when none is set (uses the core name). */
  publishedDisplayName: string | null;
  publishedLogoMediaId: string | null;
  publishedLogoUrl: string | null;
};

const SAVE_ERROR_MESSAGES: Record<string, string> = {
  entitlement_disabled: 'Брендирование недоступно на текущем тарифе.',
  commercial_read_only: 'Брендирование доступно только для просмотра.',
};

/**
 * UX-05 B2 — the clinic brand editing surface (settings "Клиника" tab). Owner-specified fields
 * only: clinic name + logo («Установить» / «Очистить») + one "Сохранить" action
 * (BRANDING_DOMAIN_CONTRACT.md "Owner decisions on the brand editing UI", 2026-07-25). No draft/
 * publish concept is exposed — see `brandingActions.ts`.
 */
export function OrgBrandingSection({
  brandingMutationAvailable,
  coreDisplayName,
  publishedDisplayName,
  publishedLogoMediaId,
  publishedLogoUrl,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(publishedDisplayName ?? coreDisplayName);
  const [logoMediaId, setLogoMediaId] = useState<string | null>(publishedLogoMediaId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const baselineName = (publishedDisplayName ?? coreDisplayName).trim();
  const dirty = name.trim() !== baselineName || logoMediaId !== publishedLogoMediaId;

  function handleLogoChange(next: OrgBrandLogoChange) {
    setLogoMediaId(next?.mediaId ?? null);
    setJustSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const trimmedName = name.trim();
      // No override recorded when the field matches the canonical core name — keeps a
      // straightforward "cleared back to platform default" state instead of an inert duplicate.
      const displayName =
        trimmedName === '' || trimmedName === coreDisplayName.trim() ? null : trimmedName;
      const result = await saveOrgBranding({ displayName, logoMediaId });
      if (!result.ok) {
        setError(SAVE_ERROR_MESSAGES[result.error] ?? 'Не удалось сохранить.');
        return;
      }
      setJustSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Бренд клиники</DoctorSectionTitle>
      </DoctorSectionHeader>

      {!brandingMutationAvailable ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-muted-foreground">
          Брендирование доступно только для просмотра. Сохранённые название и логотип остаются
          применёнными, но изменения недоступны.
        </p>
      ) : null}

      <div className="flex max-w-md flex-col gap-4">
        <DoctorField label="Название клиники" htmlFor="org-brand-name">
          <Input
            id="org-brand-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setJustSaved(false);
            }}
            disabled={!brandingMutationAvailable || saving}
            maxLength={120}
          />
        </DoctorField>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Логотип</span>
          <OrgBrandLogoControl
            initialMediaId={publishedLogoMediaId}
            initialUrl={publishedLogoUrl}
            disabled={!brandingMutationAvailable || saving}
            onChange={handleLogoChange}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {justSaved && !dirty ? <p className="text-sm text-muted-foreground">Сохранено.</p> : null}

        <div>
          <Button
            type="button"
            size="sm"
            disabled={!brandingMutationAvailable || saving || !dirty}
            onClick={() => void handleSave()}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </DoctorSection>
  );
}
