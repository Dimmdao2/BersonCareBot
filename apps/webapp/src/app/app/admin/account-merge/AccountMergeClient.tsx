/**
 * Экран объединения ОДНОЙ пары учётных записей в консоли платформы.
 *
 * Решение владельца 13.09: «мерж учёток — из журнала конфликтов». Поэтому здесь нет ни поиска людей,
 * ни списка, ни выбора второй стороны: пара приходит ссылкой из журнала, а экран только показывает,
 * что с чем сольётся, и даёт выбрать победителя по расходящимся полям.
 *
 * Наружу показываются учётные данные и ЧИСЛА по остальным сущностям. Содержания записей, дневников и
 * программ здесь нет — канон Р-АДМИН: админ платформы читает учётные данные, медицинские никогда.
 */
'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/doctor/primitives/radio-group';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { errorCodeText } from '@/shared/notifications/errorCodeText';
import { notificationText } from '@/shared/notifications/notificationText';
import type { ManualMergeResolution } from '@/infra/repos/manualMergeResolution';
import {
  buildDefaultManualMergeResolution,
  canSubmitManualMerge,
  duplicateUuidFirstFourHex,
  fioSuggestionReasonText,
  fioSummary,
  hardBlockerUi,
  isFioScalarField,
  mergeDuplicatePrefixConfirmed,
  type MergePreviewApiOk,
  type MergePreviewApiProfile,
} from './accountMergeLogic';

type Props = {
  targetId: string;
  duplicateId: string;
};

type ScalarKey = keyof ManualMergeResolution['fields'];

const SCALAR_LABELS: Record<ScalarKey, string> = {
  phone_normalized: 'Телефон',
  display_name: 'Отображаемое имя',
  first_name: 'Имя',
  last_name: 'Фамилия',
  email: 'Почта',
};

const AUTO_SCALAR_LABELS: Record<string, string> = {
  ...SCALAR_LABELS,
  patronymic: 'Отчество',
};

const CHANNEL_LABELS: Record<'telegram' | 'max' | 'vk', string> = {
  telegram: 'Telegram',
  max: 'MAX',
  vk: 'VK',
};

const COUNT_LABELS: Partial<Record<keyof MergePreviewApiOk['dependentCounts']['target'], string>> =
  {
    patientBookings: 'Записи на приём',
    beAppointments: 'Приёмы',
    reminderRules: 'Напоминания',
    supportConversations: 'Переписка с врачом',
    symptomTrackings: 'Дневник самочувствия',
    lfkComplexes: 'Комплексы ЛФК',
    treatmentProgramInstances: 'Программы лечения',
    programActionLog: 'Отметки по программе',
    mediaFilesUploadedBy: 'Загруженные файлы',
    onlineIntakeRequests: 'Онлайн-заявки',
    materialRatings: 'Оценки материалов',
    patientContentRatingFeedback: 'Отзывы о материалах',
    patientPracticeCompletions: 'Выполненные занятия',
    platformUserContacts: 'Контакты',
  };

function personLine(p: MergePreviewApiProfile): string {
  const parts = [p.displayName?.trim(), p.phoneNormalized?.trim(), p.email?.trim()].filter(
    (v): v is string => Boolean(v),
  );
  return parts.join(' · ');
}

export function AccountMergeClient({ targetId, duplicateId }: Props) {
  const router = useRouter();
  const [preview, setPreview] = useState<MergePreviewApiOk | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ManualMergeResolution | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/account-merge/preview?targetId=${encodeURIComponent(targetId)}&duplicateId=${encodeURIComponent(duplicateId)}`,
          { credentials: 'include', signal: ac.signal },
        );
        const data = (await res.json()) as MergePreviewApiOk | { ok: false };
        if (!res.ok || (data as MergePreviewApiOk).ok !== true) {
          setLoadError(
            errorCodeText((data as { error?: string }).error, notificationText.commonGenericError),
          );
          setPreview(null);
          setResolution(null);
          return;
        }
        const ok = data as MergePreviewApiOk;
        setPreview(ok);
        setResolution(buildDefaultManualMergeResolution(ok));
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setLoadError(notificationText.commonNoServerConnection);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [targetId, duplicateId]);

  const setScalarWinner = useCallback((field: ScalarKey, winner: 'target' | 'duplicate') => {
    setResolution((prev) =>
      prev ? { ...prev, fields: { ...prev.fields, [field]: winner } } : prev,
    );
  }, []);

  const setChannelWinner = useCallback(
    (channel: 'telegram' | 'max' | 'vk', winner: 'target' | 'duplicate') => {
      setResolution((prev) =>
        prev ? { ...prev, bindings: { ...prev.bindings, [channel]: winner } } : prev,
      );
    },
    [],
  );

  /** ФИО — один выбор на три поля: фамилия, имя и отображаемое имя едут с одной стороны. */
  const setFioWinner = useCallback((winner: 'target' | 'duplicate') => {
    setResolution((prev) =>
      prev
        ? {
            ...prev,
            fields: {
              ...prev.fields,
              display_name: winner,
              first_name: winner,
              last_name: winner,
            },
          }
        : prev,
    );
  }, []);

  const fioConflict = useMemo(
    () => preview?.scalarConflicts.find((c) => isFioScalarField(c.field)) ?? null,
    [preview],
  );

  const otherScalarConflicts = useMemo(
    () => preview?.scalarConflicts.filter((c) => !isFioScalarField(c.field)) ?? [],
    [preview],
  );

  const confirmed = useMemo(
    () => mergeDuplicatePrefixConfirmed(confirmInput, duplicateId),
    [confirmInput, duplicateId],
  );

  const submittable = useMemo(
    () => (preview && resolution ? canSubmitManualMerge(preview, resolution) : false),
    [preview, resolution],
  );

  const submit = useCallback(async () => {
    if (!resolution || !submittable || !confirmed || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/account-merge/apply', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || data.ok !== true) {
        toast.error(
          errorCodeText((data as { error?: string }).error, notificationText.commonGenericError),
        );
        return;
      }
      toast.success(notificationText.adminAccountsMerged);
      router.push('/app/admin/audit-log');
      router.refresh();
    } catch {
      toast.error(notificationText.commonNoServerConnection);
    } finally {
      setSubmitting(false);
    }
  }, [resolution, submittable, confirmed, submitting, router]);

  if (loading) return <DoctorPanelLoading />;

  if (loadError != null || preview == null || resolution == null) {
    return (
      <section className="rounded-xl border border-border bg-card p-6 text-sm">
        <p>{loadError ?? notificationText.commonGenericError}</p>
      </section>
    );
  }

  const blocked = preview.hardBlockers.length > 0;
  const fioWinner = resolution.fields.display_name;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-border bg-card p-4 text-sm">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Что с чем объединяется
        </h2>
        <p className="mb-1">
          <span className="text-muted-foreground">Основная карточка: </span>
          {personLine(preview.target)}
        </p>
        <p>
          <span className="text-muted-foreground">Присоединяется: </span>
          {personLine(preview.duplicate)}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Данные присоединяемой карточки перейдут в основную, а сама она перестанет быть
          самостоятельной. Действие необратимо.
        </p>
        {/*
          Вход в историю входов — отсюда, а не пунктом меню: разбор всегда начинается с конкретной
          карточки. Здесь это ещё и прямая польза — видно, один ли это человек заходил с двух
          карточек или разные люди с разных устройств (#1112).
        */}
        <p className="mt-2 text-xs">
          <Link
            href={`/app/admin/login-history?userId=${encodeURIComponent(preview.target.id)}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            Входы основной карточки
          </Link>
          <span className="text-muted-foreground"> · </span>
          <Link
            href={`/app/admin/login-history?userId=${encodeURIComponent(preview.duplicate.id)}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            входы присоединяемой
          </Link>
        </p>
      </section>

      {blocked ? (
        <section className="rounded-xl border border-destructive/40 bg-card p-4 text-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-destructive">
            Объединить нельзя
          </h2>
          <ul className="flex flex-col gap-3">
            {preview.hardBlockers.map((b) => {
              const ui = hardBlockerUi(b.code);
              return (
                <li key={b.code}>
                  <p className="font-medium">{ui.title}</p>
                  <p className="text-muted-foreground">{ui.detail}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {fioConflict != null ? (
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Имя записано по-разному — выберите карточку
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {fioSuggestionReasonText(fioConflict.reason)} Фамилия, имя и отображаемое имя берутся
            целиком из одной карточки.
          </p>
          <RadioGroup
            value={fioWinner}
            onValueChange={(v) => setFioWinner(v as 'target' | 'duplicate')}
            className="flex flex-col gap-2"
          >
            <label className="flex items-start gap-2">
              <RadioGroupItem value="target" className="mt-1" />
              <span>
                {fioSummary(preview.target) || '— пусто —'}
                <span className="block text-xs text-muted-foreground">
                  основная карточка · в списках показывается «{preview.target.displayName}»
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <RadioGroupItem value="duplicate" className="mt-1" />
              <span>
                {fioSummary(preview.duplicate) || '— пусто —'}
                <span className="block text-xs text-muted-foreground">
                  присоединяемая карточка · в списках показывается «{preview.duplicate.displayName}»
                </span>
              </span>
            </label>
          </RadioGroup>
          <p className="mt-2 text-xs text-muted-foreground">
            Отчество выбрать нельзя: останется то, что заполнено в основной карточке, а если там
            пусто — из присоединяемой.
          </p>
        </section>
      ) : null}

      {otherScalarConflicts.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Поля расходятся — выберите, что оставить
          </h2>
          <div className="flex flex-col gap-4">
            {otherScalarConflicts.map((c) => (
              <div key={c.field}>
                <Label className="mb-1 block">{SCALAR_LABELS[c.field]}</Label>
                <RadioGroup
                  value={resolution.fields[c.field]}
                  onValueChange={(v) => setScalarWinner(c.field, v as 'target' | 'duplicate')}
                  className="flex flex-col gap-1"
                >
                  <label className="flex items-center gap-2">
                    <RadioGroupItem value="target" />
                    <span>{c.targetValue ?? '— пусто —'}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <RadioGroupItem value="duplicate" />
                    <span>{c.duplicateValue ?? '— пусто —'}</span>
                  </label>
                </RadioGroup>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {preview.channelConflicts.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Один мессенджер привязан к обеим карточкам
          </h2>
          <div className="flex flex-col gap-4">
            {preview.channelConflicts.map((c) => {
              const channel = c.channelCode as 'telegram' | 'max' | 'vk';
              if (CHANNEL_LABELS[channel] == null) return null;
              return (
                <div key={c.channelCode}>
                  <Label className="mb-1 block">{CHANNEL_LABELS[channel]}</Label>
                  <RadioGroup
                    value={resolution.bindings[channel]}
                    onValueChange={(v) => setChannelWinner(channel, v as 'target' | 'duplicate')}
                    className="flex flex-col gap-1"
                  >
                    <label className="flex items-center gap-2">
                      <RadioGroupItem value="target" />
                      <span>Оставить привязку основной карточки</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <RadioGroupItem value="duplicate" />
                      <span>Оставить привязку присоединяемой карточки</span>
                    </label>
                  </RadioGroup>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {preview.autoMergeScalars.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Заполнится само
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Эти поля выбора не требуют — значение определяется автоматически. Показано, каким оно
            станет после объединения.
          </p>
          <ul className="flex flex-col gap-1">
            {preview.autoMergeScalars.map((a) => {
              const label = AUTO_SCALAR_LABELS[a.field];
              if (label == null) return null;
              return (
                <li key={a.field}>
                  <span className="text-muted-foreground">{label}: </span>
                  {a.effectiveValue ?? '— пусто —'}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4 text-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Сколько всего переносится
        </h2>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1">
          <span className="text-xs text-muted-foreground">Что</span>
          <span className="text-xs text-muted-foreground">Основная</span>
          <span className="text-xs text-muted-foreground">Присоединяется</span>
          {(
            Object.keys(COUNT_LABELS) as (keyof MergePreviewApiOk['dependentCounts']['target'])[]
          ).map((key) => {
            const t = preview.dependentCounts.target[key];
            const d = preview.dependentCounts.duplicate[key];
            if (t === 0 && d === 0) return null;
            return (
              <Fragment key={key}>
                <span>{COUNT_LABELS[key]}</span>
                <span className="text-right tabular-nums">{t}</span>
                <span className="text-right tabular-nums">{d}</span>
              </Fragment>
            );
          })}
        </div>
      </section>

      {!blocked ? (
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <Label htmlFor="account-merge-confirm" className="mb-1 block">
            Чтобы подтвердить, введите первые четыре знака кода присоединяемой карточки:{' '}
            <span className="font-mono">{duplicateUuidFirstFourHex(duplicateId)}</span>
          </Label>
          <Input
            id="account-merge-confirm"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            className="max-w-[10rem]"
            autoComplete="off"
          />
          <div className="mt-3">
            <Button
              type="button"
              variant="destructive"
              disabled={!submittable || !confirmed || submitting}
              onClick={() => void submit()}
            >
              Объединить карточки
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
