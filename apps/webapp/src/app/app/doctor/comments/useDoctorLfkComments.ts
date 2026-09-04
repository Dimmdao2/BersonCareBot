'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TodayExerciseCommentAttentionItem } from '../loadDoctorExerciseCommentAttention';
import { patientProgramInstanceHref } from '../patients/patientProgramInstanceHref';
import type {
  ExerciseCommentItem,
  PatientExercisesWithCommentsResult,
} from './loadDoctorPatientExercisesWithComments';

type ExercisesApiResponse = {
  ok?: boolean;
  data?: PatientExercisesWithCommentsResult | null;
};

/**
 * Строка модалки «Комментарии к ЛФК» — тот же item, что рисует KPI «Сегодня».
 * Второго представления упражнения с комментариями в кабинете нет.
 */
function toAttentionItem(
  exercise: ExerciseCommentItem,
  context: { patientUserId: string; patientDisplayName: string; instanceId: string },
): TodayExerciseCommentAttentionItem | null {
  if (!exercise.latestMessage) return null;
  return {
    patientUserId: context.patientUserId,
    patientDisplayName: context.patientDisplayName,
    instanceId: context.instanceId,
    stageItemId: exercise.stageItemId,
    stageItemTitle: exercise.title,
    thumb: exercise.thumb,
    latestMessage: exercise.latestMessage,
    latestMessageAtLabel: exercise.latestMessageAtLabel,
    unreadCount: exercise.unreadComments,
    href: patientProgramInstanceHref(context.patientUserId, context.instanceId, {
      discussionItemId: exercise.stageItemId,
    }),
  };
}

export type DoctorLfkCommentsData = {
  items: TodayExerciseCommentAttentionItem[];
  /** Заголовок активного этапа программы для второй строки шапки модалки. */
  activeStageTitle: string | null;
  loading: boolean;
  error: string | null;
  /** Локально гасит бейдж прочитанного треда, чтобы числа сошлись без рефетча. */
  markItemRead: (stageItemId: string) => void;
};

/**
 * Единый источник данных для модалки «Комментарии к ЛФК» обоих входов (карточка пациента →
 * ЛФК и страница «Комментарии» нижнего меню). Ходит в существующий
 * `GET /api/doctor/comments/patients/:id/exercises`; второго API-пути не заводит.
 */
export function useDoctorLfkComments({
  open,
  patientUserId,
  patientDisplayName,
}: {
  open: boolean;
  patientUserId: string | null;
  patientDisplayName: string;
}): DoctorLfkCommentsData {
  const [result, setResult] = useState<PatientExercisesWithCommentsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locallyRead, setLocallyRead] = useState<ReadonlySet<string>>(() => new Set());
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    if (!open || !patientUserId) {
      loadGenerationRef.current += 1;
      setResult(null);
      setError(null);
      setLoading(false);
      setLocallyRead(new Set());
      return;
    }

    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setError(null);
    setResult(null);
    setLocallyRead(new Set());

    void (async () => {
      try {
        const res = await fetch(
          `/api/doctor/comments/patients/${encodeURIComponent(patientUserId)}/exercises?includePastPrograms=true`,
        );
        const data = (await res.json().catch(() => null)) as ExercisesApiResponse | null;
        if (generation !== loadGenerationRef.current) return;
        if (!res.ok || !data?.ok) throw new Error('api_error');
        setResult(data.data ?? null);
      } catch {
        if (generation !== loadGenerationRef.current) return;
        setError('Не удалось загрузить комментарии к ЛФК.');
      } finally {
        if (generation === loadGenerationRef.current) setLoading(false);
      }
    })();
  }, [open, patientUserId]);

  const markItemRead = useCallback((stageItemId: string) => {
    setLocallyRead((current) => {
      if (current.has(stageItemId)) return current;
      const next = new Set(current);
      next.add(stageItemId);
      return next;
    });
  }, []);

  const items = useMemo(() => {
    if (!result || !patientUserId) return [];
    const context = {
      patientUserId,
      patientDisplayName,
      instanceId: result.instanceId,
    };
    return result.groups
      .flatMap((group) => group.exercises)
      .map((exercise) =>
        toAttentionItem(
          locallyRead.has(exercise.stageItemId)
            ? { ...exercise, unreadComments: 0 }
            : exercise,
          context,
        ),
      )
      .filter((item): item is TodayExerciseCommentAttentionItem => item !== null)
      .sort((a, b) => b.latestMessage.createdAt.localeCompare(a.latestMessage.createdAt));
  }, [locallyRead, patientDisplayName, patientUserId, result]);

  const activeStageTitle = useMemo(
    () => result?.groups.find((group) => group.isActive)?.stageTitle ?? null,
    [result],
  );

  return { items, activeStageTitle, loading, error, markItemRead };
}
