'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  DoctorSection,
  DoctorSectionActions,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/doctor/primitives/tooltip';
import {
  defaultDoctorWorkspaceClientDefaults,
  defaultDoctorWorkspaceComposition,
  DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY,
  DOCTOR_WORKSPACE_COMPOSITION_KEY,
  resolveWorkspaceModuleEffective,
  WORKSPACE_CLIENT_CHANNEL_KEYS,
  WORKSPACE_CLIENT_DEFAULT_MODES,
  WORKSPACE_MODULE_DEPENDENCIES,
  WORKSPACE_MODULE_CONFIG_KEYS,
  type DoctorWorkspaceClientDefaults,
  type DoctorWorkspaceComposition,
  type WorkspaceClientChannelKey,
  type WorkspaceClientDefaultMode,
  type WorkspaceModuleAvailability,
  type WorkspaceModuleConfigKey,
} from '@/modules/system-settings/doctorWorkspaceComposition';
import {
  APPOINTMENT_LABEL_KEY,
  APPOINTMENT_LABEL_VALUES,
  normalizeAppointmentLabel,
  normalizePatientLabel,
  normalizeSupportGroupLabel,
  resolvePatientTerms,
  SUPPORT_GROUP_LABEL_KEY,
  type AppointmentLabelValue,
  type PatientLabelValue,
  type SupportGroupLabelValue,
} from '@/modules/system-settings/patientTerms';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import { notificationText } from '@/shared/notifications/notificationText';

const WORKSPACE_MODULE_LABELS: Readonly<Record<WorkspaceModuleConfigKey, string>> = {
  medical_record: 'Медкарта',
  encounters: 'Приёмы',
  rehabilitation: 'Реабилитация',
  direct_chat: 'Чат',
  program_comments: 'Комментарии к программе',
  program_media: 'Медиа в программе',
  mailings: 'Рассылки',
  analytics: 'Аналитика',
  client_portal: 'Кабинет',
  video_meetings: 'Видеовстречи',
  leads: 'Заявки',
  content: 'Контент',
  courses: 'Курсы',
};

const WORKSPACE_REQUIREMENT_LABELS: Readonly<
  Partial<Record<WorkspaceModuleConfigKey, { label: string; single: string }>>
> = {
  rehabilitation: { label: 'реабилитация', single: 'Требуется реабилитация' },
  program_comments: {
    label: 'комментарии к программе',
    single: 'Требуются комментарии к программе',
  },
  client_portal: { label: 'кабинет', single: 'Требуется кабинет' },
};

function workspaceDependencyHint(
  key: WorkspaceModuleConfigKey,
  effectiveModules: Readonly<Partial<Record<WorkspaceModuleConfigKey, boolean>>>,
): string | null {
  const requirements = WORKSPACE_MODULE_DEPENDENCIES[key]
    .filter((dependency) => effectiveModules[dependency] !== true)
    .map((dependency) => {
      const configured = WORKSPACE_REQUIREMENT_LABELS[dependency];
      const label = configured?.label ?? WORKSPACE_MODULE_LABELS[dependency].toLowerCase();
      return { label, single: configured?.single ?? `Требуется ${label}` };
    });
  if (requirements.length === 0) return null;
  if (requirements.length === 1) return requirements[0]!.single;
  return `Требуются: ${requirements.map((requirement) => requirement.label).join(' и ')}`;
}

const WORKSPACE_CHANNEL_LABELS: Readonly<Record<WorkspaceClientChannelKey, string>> = {
  direct_chat: 'Чат по умолчанию',
  program_comments: 'Комментарии по умолчанию',
  program_media: 'Медиа по умолчанию',
};

const WORKSPACE_SETTINGS_BATCH_KEYS = [
  DOCTOR_WORKSPACE_COMPOSITION_KEY,
  DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY,
  'patient_label',
  APPOINTMENT_LABEL_KEY,
  SUPPORT_GROUP_LABEL_KEY,
] as const;

type SettingsFormProps = {
  patientLabel: string;
  /** Как организация называет событие записи; не распознано — «приём», сегодняшнее поведение. */
  appointmentLabel?: string;
  smsFallbackEnabled: boolean;
  supportCommentsWithoutSupportDefault: boolean;
  supportMediaWithoutSupportDefault: boolean;
  settingsEndpoint?: '/api/doctor/settings' | '/api/admin/settings';
  showPatientLabel?: boolean;
  showSmsFallback?: boolean;
  showSupportDefaults?: boolean;
  workspaceComposition?: DoctorWorkspaceComposition;
  workspaceClientDefaults?: DoctorWorkspaceClientDefaults;
  workspaceModuleAvailability?: WorkspaceModuleAvailability;
  supportGroupLabel?: SupportGroupLabelValue;
};

type WorkspaceDraft = {
  composition: DoctorWorkspaceComposition;
  clientDefaults: DoctorWorkspaceClientDefaults;
  label: PatientLabelValue;
  appointmentWord: AppointmentLabelValue;
  supportLabel: SupportGroupLabelValue;
};

export function SettingsForm({
  patientLabel,
  appointmentLabel,
  smsFallbackEnabled,
  supportCommentsWithoutSupportDefault,
  supportMediaWithoutSupportDefault,
  settingsEndpoint = '/api/doctor/settings',
  showPatientLabel = true,
  showSmsFallback,
  showSupportDefaults = true,
  workspaceComposition,
  workspaceClientDefaults,
  workspaceModuleAvailability,
  supportGroupLabel = 'on_support',
}: SettingsFormProps) {
  const router = useRouter();
  const { patientGenitive, patientPluralLabel } = useDoctorPatientTerms();
  const [label, setLabel] = useState<PatientLabelValue>(
    normalizePatientLabel(patientLabel) ?? 'пациент',
  );
  const [appointmentWord, setAppointmentWord] = useState<AppointmentLabelValue>(
    normalizeAppointmentLabel(appointmentLabel) ?? 'приём',
  );
  const [supportLabel, setSupportLabel] = useState<SupportGroupLabelValue>(supportGroupLabel);
  const [smsFallback, setSmsFallback] = useState(smsFallbackEnabled);
  const [supportCommentsDefault, setSupportCommentsDefault] = useState(
    supportCommentsWithoutSupportDefault,
  );
  const [supportMediaDefault, setSupportMediaDefault] = useState(supportMediaWithoutSupportDefault);
  const [composition, setComposition] = useState(
    workspaceComposition ?? defaultDoctorWorkspaceComposition(),
  );
  const [clientDefaults, setClientDefaults] = useState(
    workspaceClientDefaults ?? defaultDoctorWorkspaceClientDefaults(),
  );
  const [isPending, startTransition] = useTransition();
  const workspaceMode =
    workspaceComposition !== undefined &&
    workspaceClientDefaults !== undefined &&
    workspaceModuleAvailability !== undefined;
  const shouldShowSmsFallback = showSmsFallback ?? showSupportDefaults;
  const fallbackAvailability = Object.fromEntries(
    WORKSPACE_MODULE_CONFIG_KEYS.map((key) => [key, true]),
  ) as Record<WorkspaceModuleConfigKey, boolean>;
  const availability = workspaceModuleAvailability ?? fallbackAvailability;
  const availableModules = resolveWorkspaceModuleEffective(
    defaultDoctorWorkspaceComposition(),
    availability,
  );
  const effectiveModules = resolveWorkspaceModuleEffective(composition, availability);
  const formTerms = resolvePatientTerms({
    patientLabel: label,
    supportGroupLabel: supportLabel,
    appointmentLabel: appointmentWord,
  });
  const supportGroupDisplayLabel = formTerms.supportGroupLabel;
  const defaultModeOptions: ReadonlyArray<{
    value: WorkspaceClientDefaultMode;
    label: string;
  }> = [
    { value: 'off', label: 'Выключено' },
    { value: 'all', label: 'Для всех' },
    { value: 'on_support', label: supportGroupDisplayLabel },
  ];

  const workspaceDraft = useMemo<WorkspaceDraft>(
    () => ({
      composition,
      clientDefaults,
      label,
      appointmentWord,
      supportLabel,
    }),
    [appointmentWord, clientDefaults, composition, label, supportLabel],
  );
  const workspaceDraftSignature = JSON.stringify(workspaceDraft);
  const lastSavedWorkspaceRef = useRef({
    signature: workspaceDraftSignature,
    draft: workspaceDraft,
  });
  const workspacePendingSaveRef = useRef<{
    signature: string;
    draft: WorkspaceDraft;
  } | null>(null);
  const workspaceSaveRunningRef = useRef(false);

  useEffect(() => {
    if (!workspaceMode || workspaceDraftSignature === lastSavedWorkspaceRef.current.signature) {
      return;
    }

    workspacePendingSaveRef.current = {
      signature: workspaceDraftSignature,
      draft: workspaceDraft,
    };
    if (workspaceSaveRunningRef.current) return;
    workspaceSaveRunningRef.current = true;

    const restoreLastSavedWorkspace = () => {
      const saved = lastSavedWorkspaceRef.current.draft;
      setComposition(saved.composition);
      setClientDefaults(saved.clientDefaults);
      setLabel(saved.label);
      setAppointmentWord(saved.appointmentWord);
      setSupportLabel(saved.supportLabel);
    };

    startTransition(async () => {
      try {
        while (workspacePendingSaveRef.current) {
          const pending = workspacePendingSaveRef.current;
          workspacePendingSaveRef.current = null;
          let failureMessage: string | null = null;

          try {
            const response = await fetch(settingsEndpoint, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items: [
                  {
                    key: DOCTOR_WORKSPACE_COMPOSITION_KEY,
                    value: { value: pending.draft.composition },
                  },
                  {
                    key: DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY,
                    value: { value: pending.draft.clientDefaults },
                  },
                  { key: 'patient_label', value: { value: pending.draft.label } },
                  {
                    key: APPOINTMENT_LABEL_KEY,
                    value: { value: pending.draft.appointmentWord },
                  },
                  {
                    key: SUPPORT_GROUP_LABEL_KEY,
                    value: { value: pending.draft.supportLabel },
                  },
                ],
              }),
            });
            const body = (await response.json().catch(() => null)) as {
              ok?: boolean;
              settings?: Array<{ key: string; valueJson: unknown }>;
            } | null;
            if (!response.ok || !body?.ok) {
              failureMessage = notificationText.settingsSaveFailed;
            } else {
              const savedKeys = new Set((body.settings ?? []).map((setting) => setting.key));
              if (WORKSPACE_SETTINGS_BATCH_KEYS.some((key) => !savedKeys.has(key))) {
                failureMessage = notificationText.settingsConfirmSavedFailed;
              }
            }
          } catch {
            failureMessage = notificationText.commonSaveFailed;
          }

          if (failureMessage) {
            toast.error(failureMessage);
            if (!workspacePendingSaveRef.current) restoreLastSavedWorkspace();
            continue;
          }

          lastSavedWorkspaceRef.current = pending;
          if (!workspacePendingSaveRef.current) {
            toast.success(notificationText.commonSaved);
            router.refresh();
          }
        }
      } finally {
        workspaceSaveRunningRef.current = false;
      }
    });
  }, [
    router,
    settingsEndpoint,
    startTransition,
    workspaceDraft,
    workspaceDraftSignature,
    workspaceMode,
  ]);

  async function handleSave() {
    if (workspaceMode) return;
    startTransition(async () => {
      try {
        let response: Response;
        if (showPatientLabel) {
          response = await fetch(settingsEndpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'patient_label', value: { value: label } }),
          });
        } else {
          const items = [
            ...(shouldShowSmsFallback
              ? [{ key: 'sms_fallback_enabled', value: { value: smsFallback } }]
              : []),
            ...(showSupportDefaults
              ? [
                  {
                    key: 'doctor_patient_support_comments_without_support_default_enabled',
                    value: { value: supportCommentsDefault },
                  },
                  {
                    key: 'doctor_patient_support_media_without_support_default_enabled',
                    value: { value: supportMediaDefault },
                  },
                ]
              : []),
          ];
          response = await fetch(settingsEndpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items.length === 1 ? items[0] : { items }),
          });
        }
        const body = (await response.json().catch(() => null)) as {
          ok?: boolean;
          setting?: { key: string; valueJson: unknown };
          settings?: Array<{ key: string; valueJson: unknown }>;
        } | null;
        if (!response.ok || !body?.ok) {
          toast.error(notificationText.settingsSaveFailed);
          return;
        }
        const savedSettings = body.settings ?? (body.setting ? [body.setting] : []);
        if (showSupportDefaults) {
          const valueFor = (key: string) => {
            const valueJson = savedSettings.find((setting) => setting.key === key)?.valueJson;
            return valueJson !== null && typeof valueJson === 'object' && 'value' in valueJson
              ? (valueJson as { value: unknown }).value
              : undefined;
          };
          if (
            valueFor('sms_fallback_enabled') !== smsFallback ||
            valueFor('doctor_patient_support_comments_without_support_default_enabled') !==
              supportCommentsDefault ||
            valueFor('doctor_patient_support_media_without_support_default_enabled') !==
              supportMediaDefault
          ) {
            toast.error(notificationText.settingsConfirmSavedFailed);
            return;
          }
        }
        toast.success(notificationText.commonSaved);
      } catch {
        toast.error(notificationText.commonSaveFailed);
      }
    });
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>
          {workspaceMode ? 'Рабочее пространство' : 'Настройки кабинета'}
        </DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="flex flex-col gap-4">
        {workspaceMode ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {WORKSPACE_MODULE_CONFIG_KEYS.filter((key) => availableModules[key]).map((key) => {
                const dependenciesMet = WORKSPACE_MODULE_DEPENDENCIES[key].every(
                  (parent) => effectiveModules[parent],
                );
                const dependencyHint = workspaceDependencyHint(key, effectiveModules);
                const switchControl = (
                  <Switch
                    id={`workspace-module-${key}`}
                    checked={dependenciesMet ? composition.modules[key] : false}
                    onCheckedChange={(checked) =>
                      setComposition((current) => ({
                        ...current,
                        modules: { ...current.modules, [key]: checked },
                      }))
                    }
                    disabled={isPending || !dependenciesMet}
                  />
                );
                return (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <Label htmlFor={`workspace-module-${key}`}>
                      {key === 'client_portal'
                        ? `${WORKSPACE_MODULE_LABELS[key]} ${patientGenitive}`
                        : WORKSPACE_MODULE_LABELS[key]}
                    </Label>
                    {dependencyHint ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              className="inline-flex cursor-help"
                              tabIndex={0}
                              aria-label={dependencyHint}
                            >
                              {switchControl}
                            </span>
                          }
                        />
                        <TooltipContent>{dependencyHint}</TooltipContent>
                      </Tooltip>
                    ) : (
                      switchControl
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {WORKSPACE_CLIENT_CHANNEL_KEYS.filter((key) => availableModules[key]).map((key) => {
                const mode = clientDefaults.channelDefaults[key];
                return (
                  <div key={key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`workspace-default-${key}`}>
                      {WORKSPACE_CHANNEL_LABELS[key]}
                    </Label>
                    <Select
                      value={mode}
                      onValueChange={(value) => {
                        if (
                          value &&
                          (WORKSPACE_CLIENT_DEFAULT_MODES as readonly string[]).includes(value)
                        ) {
                          setClientDefaults((current) => ({
                            ...current,
                            channelDefaults: {
                              ...current.channelDefaults,
                              [key]: value as WorkspaceClientDefaultMode,
                            },
                          }));
                        }
                      }}
                      disabled={isPending || !effectiveModules[key]}
                    >
                      <SelectTrigger
                        id={`workspace-default-${key}`}
                        displayLabel={
                          defaultModeOptions.find((option) => option.value === mode)?.label
                        }
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {defaultModeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} label={option.label}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="patient-symptom-tracking-default">Симптомы при создании</Label>
                <Select
                  value={clientDefaults.patientSymptomTrackingDefault}
                  onValueChange={(value) => {
                    if (
                      value &&
                      (WORKSPACE_CLIENT_DEFAULT_MODES as readonly string[]).includes(value)
                    ) {
                      setClientDefaults((current) => ({
                        ...current,
                        patientSymptomTrackingDefault: value as WorkspaceClientDefaultMode,
                      }));
                    }
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger
                    id="patient-symptom-tracking-default"
                    displayLabel={
                      defaultModeOptions.find(
                        (option) => option.value === clientDefaults.patientSymptomTrackingDefault,
                      )?.label
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {defaultModeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} label={option.label}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="patient-label-select">{patientPluralLabel}</Label>
                <Select
                  value={label}
                  onValueChange={(value) => {
                    const normalized = normalizePatientLabel(value);
                    if (normalized) setLabel(normalized);
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger
                    id="patient-label-select"
                    displayLabel={label === 'клиент' ? 'Клиенты' : 'Пациенты'}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="клиент" label="Клиенты">
                      Клиенты
                    </SelectItem>
                    <SelectItem value="пациент" label="Пациенты">
                      Пациенты
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="appointment-label-select">{formTerms.appointmentPluralLabel}</Label>
                <Select
                  value={appointmentWord}
                  onValueChange={(value) => {
                    const normalized = normalizeAppointmentLabel(value);
                    if (normalized) setAppointmentWord(normalized);
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger
                    id="appointment-label-select"
                    displayLabel={formTerms.appointmentSingularLabel}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPOINTMENT_LABEL_VALUES.map((value) => {
                      const optionLabel = resolvePatientTerms({
                        patientLabel: label,
                        supportGroupLabel: supportLabel,
                        appointmentLabel: value,
                      }).appointmentSingularLabel;
                      return (
                        <SelectItem key={value} value={value} label={optionLabel}>
                          {optionLabel}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="support-group-label-select">
                  Группа «{supportGroupDisplayLabel}»
                </Label>
                <Select
                  value={supportLabel}
                  onValueChange={(value) => {
                    const normalized = normalizeSupportGroupLabel(value);
                    if (normalized) setSupportLabel(normalized);
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger
                    id="support-group-label-select"
                    displayLabel={supportGroupDisplayLabel}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="favorites" label="Избранные">
                      Избранные
                    </SelectItem>
                    <SelectItem value="on_support" label="Сопровождение">
                      Сопровождение
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        ) : (
          <>
            {showPatientLabel ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="patient-label-select">
                  Как называть {patientGenitive}: Клиент / Пациент
                </Label>
                <Select
                  value={label}
                  onValueChange={(value) => {
                    const normalized = normalizePatientLabel(value);
                    if (normalized) setLabel(normalized);
                  }}
                >
                  <SelectTrigger
                    id="patient-label-select"
                    className="w-40"
                    displayLabel={label === 'клиент' ? 'Клиент' : 'Пациент'}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="пациент">Пациент</SelectItem>
                    <SelectItem value="клиент">Клиент</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {shouldShowSmsFallback ? (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="sms-fallback-enabled">SMS fallback</Label>
                <Switch
                  id="sms-fallback-enabled"
                  checked={smsFallback}
                  onCheckedChange={setSmsFallback}
                  disabled={isPending}
                />
              </div>
            ) : null}

            {showSupportDefaults ? (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="comments-without-support">
                  Комментарии без группы «{supportGroupDisplayLabel}»
                </Label>
                <Switch
                  id="comments-without-support"
                  checked={supportCommentsDefault}
                  onCheckedChange={setSupportCommentsDefault}
                  disabled={isPending}
                />
              </div>
            ) : null}

            {showSupportDefaults ? (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="media-without-support">
                  Медиа без группы «{supportGroupDisplayLabel}»
                </Label>
                <Switch
                  id="media-without-support"
                  checked={supportMediaDefault}
                  onCheckedChange={setSupportMediaDefault}
                  disabled={isPending}
                />
              </div>
            ) : null}
          </>
        )}

        {!workspaceMode ? (
          <DoctorSectionActions>
            <Button type="button" size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DoctorSectionActions>
        ) : null}
      </div>
    </DoctorSection>
  );
}
