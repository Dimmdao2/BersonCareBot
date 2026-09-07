'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import type {
  ClientChannelPolicy,
  ClientSupportProfile,
  PatientProgramInteractionPolicy,
} from '@/modules/doctor-clients/supportPolicy';
import type {
  WorkspaceClientChannelKey,
  WorkspaceClientDefaultMode,
  WorkspaceModuleEffective,
} from '@/modules/system-settings/doctorWorkspaceComposition';

type SupportSettingsResponse = {
  ok?: boolean;
  profile?: ClientSupportProfile & { updatedAt: string | null };
  effectivePolicy?: PatientProgramInteractionPolicy;
  channelPolicy?: ClientChannelPolicy;
  channelDefaults?: Readonly<Record<WorkspaceClientChannelKey, WorkspaceClientDefaultMode>>;
  workspaceModules?: WorkspaceModuleEffective;
};

type ChannelControl = {
  key: WorkspaceClientChannelKey | 'portal';
  title?: string;
  module: keyof WorkspaceModuleEffective;
  override: keyof Pick<
    ClientSupportProfile,
    'directChatEnabled' | 'commentsEnabled' | 'mediaEnabled' | 'portalEnabled'
  >;
  allowed: keyof ClientChannelPolicy;
};

const CHANNEL_CONTROLS: readonly ChannelControl[] = [
  { key: 'direct_chat', title: 'Чат', module: 'direct_chat', override: 'directChatEnabled', allowed: 'directChatAllowed' },
  { key: 'program_comments', title: 'Комментарии к программе', module: 'program_comments', override: 'commentsEnabled', allowed: 'commentsAllowed' },
  { key: 'program_media', title: 'Медиа программы', module: 'program_media', override: 'mediaEnabled', allowed: 'mediaAllowed' },
  { key: 'portal', module: 'client_portal', override: 'portalEnabled', allowed: 'portalAllowed' },
];

function defaultSource(
  mode: WorkspaceClientDefaultMode | undefined,
  groupLabel: string,
  patientGenPlural: string,
): string {
  if (mode === 'all') return `настройка кабинета: для всех ${patientGenPlural}`;
  if (mode === 'on_support') return `настройка кабинета: только «${groupLabel}»`;
  return 'настройка кабинета: выключено';
}

export function DoctorClientSupportPanel({
  patientUserId,
  initialEffectivePolicy,
}: {
  patientUserId: string;
  /** Keeps the membership switch stable until the complete control state is read. */
  initialEffectivePolicy?: PatientProgramInteractionPolicy | null;
}) {
  const { patientGenitive, patientGenPlural, supportGroupLabel } = useDoctorPatientTerms();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onSupport, setOnSupport] = useState(() => initialEffectivePolicy?.onSupport ?? false);
  const [profile, setProfile] = useState<ClientSupportProfile | null>(null);
  const [channelPolicy, setChannelPolicy] = useState<ClientChannelPolicy | null>(null);
  const [channelDefaults, setChannelDefaults] = useState<SupportSettingsResponse['channelDefaults']>();
  const [workspaceModules, setWorkspaceModules] = useState<WorkspaceModuleEffective | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(patientUserId)}/support-settings`);
      const data = (await res.json()) as SupportSettingsResponse;
      if (!res.ok || !data.ok || !data.effectivePolicy || !data.profile || !data.channelPolicy || !data.workspaceModules) {
        setError('Не удалось загрузить настройки сопровождения');
        return;
      }
      setOnSupport(data.effectivePolicy.onSupport);
      setProfile(data.profile);
      setChannelPolicy(data.channelPolicy);
      setChannelDefaults(data.channelDefaults);
      setWorkspaceModules(data.workspaceModules);
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }, [patientUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(patientUserId)}/support-settings`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      );
      const data = (await res.json()) as SupportSettingsResponse;
      if (!res.ok || !data.ok || !data.effectivePolicy) {
        setError('Не удалось сохранить');
        return;
      }
      setOnSupport(data.effectivePolicy.onSupport);
      await load();
    } catch {
      setError('Ошибка сети');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <DoctorPanelLoading className="py-6" />;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Switch id="doctor-client-on-support" checked={onSupport} disabled={saving} onCheckedChange={(checked) => void patch({ onSupport: checked })} />
        <Label htmlFor="doctor-client-on-support" className="text-sm font-medium">{supportGroupLabel}</Label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {CHANNEL_CONTROLS.filter((control) => workspaceModules?.[control.module]).map((control) => {
          const override = profile?.[control.override] ?? null;
          const allowed = channelPolicy?.[control.allowed] === true;
          const title = control.title ?? `Кабинет ${patientGenitive}`;
          const source = override === null
            ? control.key === 'portal'
              ? `доступ кабинета ${patientGenitive} по умолчанию`
              : defaultSource(channelDefaults?.[control.key], supportGroupLabel, patientGenPlural)
            : override ? 'индивидуальное разрешение' : 'индивидуальный запрет';
          return (
            <section key={control.key} className="rounded-md border border-border/60 bg-background px-3 py-2">
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Эффективно: {allowed ? 'разрешено' : 'запрещено'} · {source}</p>
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={title}>
                <Button type="button" size="sm" variant={override === null ? 'secondary' : 'outline'} disabled={saving} onClick={() => void patch({ [control.override]: null })}>По умолчанию</Button>
                <Button type="button" size="sm" variant={override === true ? 'secondary' : 'outline'} disabled={saving} onClick={() => void patch({ [control.override]: true })}>Разрешить</Button>
                <Button type="button" size="sm" variant={override === false ? 'secondary' : 'outline'} disabled={saving} onClick={() => void patch({ [control.override]: false })}>Запретить</Button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
