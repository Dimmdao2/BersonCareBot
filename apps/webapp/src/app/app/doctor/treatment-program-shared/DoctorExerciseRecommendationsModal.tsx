'use client';

import { useEffect, useState } from 'react';
import type { RecommendationMediaItem } from '@/modules/recommendations/types';
import type {
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramInstanceStageItemView,
} from '@/modules/treatment-program/types';
import { effectiveInstanceStageItemComment } from '@/modules/treatment-program/types';
import {
  INSTANCE_EDITOR_LOAD_MAX_PAIN_RANGE,
  INSTANCE_EDITOR_LOAD_REPS_RANGE,
  INSTANCE_EDITOR_LOAD_SETS_RANGE,
  INSTANCE_EDITOR_LOAD_WEIGHT_RANGE,
  parseInstanceEditorDecimalLoadField,
  parseInstanceEditorLoadField,
} from './instanceEditorLoadSettings';
import { DoctorModal, DoctorModalCompositeTitle } from '@/shared/ui/doctor/DoctorModal';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { DoctorExerciseMediaPlayer } from '@/shared/ui/doctor/media/DoctorExerciseMediaPlayer';

export type DoctorExerciseRecommendationsValue = {
  reps: number | null;
  sets: number | null;
  maxPain: number | null;
  weightKg: number | null;
  note: string | null;
};

export type DoctorExerciseRecommendationsSaveResult = {
  value: DoctorExerciseRecommendationsValue;
  item: TreatmentProgramInstanceStageItemView | null;
};

type PatchStageItemResponse = {
  ok?: boolean;
  error?: string;
  item?: TreatmentProgramInstanceStageItemRow;
};

function toViewItem(
  row: TreatmentProgramInstanceStageItemRow,
): TreatmentProgramInstanceStageItemView {
  return {
    ...row,
    effectiveComment: effectiveInstanceStageItemComment(row),
  };
}

async function patchStageItem(
  instanceId: string,
  itemId: string,
  body: Record<string, unknown>,
): Promise<TreatmentProgramInstanceStageItemView> {
  const response = await fetch(
    `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stage-items/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const payload = (await response.json().catch(() => null)) as PatchStageItemResponse | null;
  if (!response.ok || !payload?.ok || !payload.item) {
    throw new Error(payload?.error ?? 'Не удалось сохранить рекомендации');
  }
  return toViewItem(payload.item);
}

export function DoctorExerciseRecommendationsModal(props: {
  open: boolean;
  onClose: () => void;
  instanceId: string;
  itemId: string;
  exerciseTitle: string;
  media: RecommendationMediaItem | null;
  initialValue: DoctorExerciseRecommendationsValue;
  onSaved: (result: DoctorExerciseRecommendationsSaveResult) => void;
}) {
  const { open, onClose, instanceId, itemId, exerciseTitle, media, initialValue, onSaved } = props;
  const [reps, setReps] = useState('');
  const [sets, setSets] = useState('');
  const [maxPain, setMaxPain] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReps(initialValue.reps == null ? '' : String(initialValue.reps));
    setSets(initialValue.sets == null ? '' : String(initialValue.sets));
    setMaxPain(initialValue.maxPain == null ? '' : String(initialValue.maxPain));
    setWeightKg(initialValue.weightKg == null ? '' : String(initialValue.weightKg));
    setNote(initialValue.note ?? '');
    setSaveError(null);
  }, [
    open,
    initialValue.reps,
    initialValue.sets,
    initialValue.maxPain,
    initialValue.weightKg,
    initialValue.note,
  ]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const value: DoctorExerciseRecommendationsValue = {
        reps: parseInstanceEditorLoadField(reps, 'Повторы', INSTANCE_EDITOR_LOAD_REPS_RANGE),
        sets: parseInstanceEditorLoadField(sets, 'Подходы', INSTANCE_EDITOR_LOAD_SETS_RANGE),
        maxPain: parseInstanceEditorLoadField(
          maxPain,
          'Макс. боль',
          INSTANCE_EDITOR_LOAD_MAX_PAIN_RANGE,
        ),
        weightKg: parseInstanceEditorDecimalLoadField(
          weightKg,
          'Вес',
          INSTANCE_EDITOR_LOAD_WEIGHT_RANGE,
        ),
        note: note.trim() || null,
      };
      let savedItem: TreatmentProgramInstanceStageItemView | null = null;
      if (
        value.reps !== initialValue.reps ||
        value.sets !== initialValue.sets ||
        value.maxPain !== initialValue.maxPain ||
        value.weightKg !== initialValue.weightKg
      ) {
        savedItem = await patchStageItem(instanceId, itemId, {
          loadSettings: {
            reps: value.reps,
            sets: value.sets,
            maxPain: value.maxPain,
            weightKg: value.weightKg,
          },
        });
      }
      if (value.note !== initialValue.note) {
        savedItem = await patchStageItem(instanceId, itemId, { localComment: value.note });
      }
      onSaved({ value, item: savedItem });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить рекомендации');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DoctorModal
      open={open}
      onClose={onClose}
      title={<DoctorModalCompositeTitle label="Рекомендации" entity={exerciseTitle} />}
      size="lg"
      bodyClassName="space-y-4"
      footer={
        <>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </>
      }
    >
      <DoctorExerciseMediaPlayer media={media} title={exerciseTitle} />

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`exercise-recommendations-reps-${itemId}`}>
            Повторы
          </Label>
          <Input
            id={`exercise-recommendations-reps-${itemId}`}
            inputMode="numeric"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`exercise-recommendations-sets-${itemId}`}>
            Подходы
          </Label>
          <Input
            id={`exercise-recommendations-sets-${itemId}`}
            inputMode="numeric"
            value={sets}
            onChange={(event) => setSets(event.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`exercise-recommendations-pain-${itemId}`}>
            Макс. боль
          </Label>
          <Input
            id={`exercise-recommendations-pain-${itemId}`}
            inputMode="numeric"
            value={maxPain}
            onChange={(event) => setMaxPain(event.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`exercise-recommendations-weight-${itemId}`}>
            Вес, кг
          </Label>
          <Input
            id={`exercise-recommendations-weight-${itemId}`}
            inputMode="decimal"
            value={weightKg}
            onChange={(event) => setWeightKg(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`exercise-recommendations-note-${itemId}`}>
          Заметка специалиста
        </Label>
        <Textarea
          id={`exercise-recommendations-note-${itemId}`}
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
    </DoctorModal>
  );
}
