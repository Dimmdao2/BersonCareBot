'use client';

import { useMemo, useState } from 'react';
import {
  createHumanMergeDecision,
  type HumanMergeDecision,
  type HumanMergeFioField,
  type HumanMergeFioSelection,
  type HumanMergePrompt,
} from '@bersoncare/platform-merge';
import { Button } from '@/shared/ui/patient/primitives/button';
import { Input } from '@/shared/ui/patient/primitives/input';
import { patientMutedTextClass, patientSectionTitleClass } from '@/shared/ui/patient/patientVisual';
import { FIO_LATIN_REJECTED_TEXT, formatDoctorFio, isCyrillicFioInput } from '@/shared/lib/fio';

const FIELD_LABELS: Record<HumanMergeFioField, string> = {
  last_name: 'Фамилия',
  first_name: 'Имя',
  patronymic: 'Отчество',
};

type SelectionState = Partial<Record<HumanMergeFioField, HumanMergeFioSelection>>;

function accountValue(
  prompt: HumanMergePrompt,
  field: HumanMergeFioField,
  side: 'target' | 'duplicate',
) {
  const account = prompt[side];
  return field === 'last_name'
    ? account.lastName
    : field === 'first_name'
      ? account.firstName
      : account.patronymic;
}

export function AccountMergeConfirmation(props: {
  prompt: HumanMergePrompt;
  busy: boolean;
  onReject: () => void;
  onConfirm: (decision: HumanMergeDecision) => Promise<void>;
}) {
  const [accountConfirmed, setAccountConfirmed] = useState(false);
  const [selections, setSelections] = useState<SelectionState>({});
  const [customField, setCustomField] = useState<HumanMergeFioField | null>(null);
  const [customValues, setCustomValues] = useState<Partial<Record<HumanMergeFioField, string>>>({});
  const found =
    props.prompt.foundAccountId === props.prompt.target.id
      ? props.prompt.target
      : props.prompt.duplicate;
  const foundFio = formatDoctorFio(
    {
      lastName: found.lastName,
      firstName: found.firstName,
      patronymic: found.patronymic,
    },
    found.displayName,
  );
  const ready = useMemo(
    () => props.prompt.conflicts.every((field) => selections[field] !== undefined),
    [props.prompt.conflicts, selections],
  );

  if (!accountConfirmed) {
    return (
      <section className="flex w-full flex-col gap-3 text-left">
        <h2 className={patientSectionTitleClass}>Это ваш аккаунт?</h2>
        <div className="rounded-xl border p-3">
          <p>{foundFio || 'ФИО не указано'}</p>
          <p className={patientMutedTextClass}>
            Создан {new Intl.DateTimeFormat('ru-RU').format(new Date(found.createdAt))}
          </p>
        </div>
        <Button
          type="button"
          disabled={props.busy}
          onClick={() => {
            if (props.prompt.conflicts.length === 0) {
              void props.onConfirm(createHumanMergeDecision(props.prompt, {}));
              return;
            }
            setAccountConfirmed(true);
          }}
        >
          Да, это мой аккаунт
        </Button>
        <Button type="button" variant="outline" disabled={props.busy} onClick={props.onReject}>
          Нет, это не мой аккаунт
        </Button>
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col gap-4 text-left">
      <h2 className={patientSectionTitleClass}>Выберите правильные данные</h2>
      {props.prompt.conflicts.map((field) => {
        const targetValue = accountValue(props.prompt, field, 'target') ?? '';
        const duplicateValue = accountValue(props.prompt, field, 'duplicate') ?? '';
        const custom = customValues[field] ?? '';
        return (
          <fieldset key={field} className="flex flex-col gap-2">
            <legend>{FIELD_LABELS[field]}</legend>
            {(['target', 'duplicate'] as const).map((source) => {
              const value = source === 'target' ? targetValue : duplicateValue;
              return (
                <Button
                  key={source}
                  type="button"
                  variant={selections[field]?.source === source ? 'default' : 'outline'}
                  disabled={props.busy}
                  onClick={() => {
                    setCustomField(null);
                    setSelections((current) => ({ ...current, [field]: { source } }));
                  }}
                >
                  {value}
                </Button>
              );
            })}
            <Button
              type="button"
              variant={customField === field ? 'default' : 'outline'}
              disabled={props.busy}
              onClick={() => setCustomField(field)}
            >
              Ввести свой вариант
            </Button>
            {customField === field ? (
              <div className="flex flex-col gap-2">
                <Input
                  value={custom}
                  autoFocus
                  onChange={(event) =>
                    setCustomValues((current) => ({ ...current, [field]: event.target.value }))
                  }
                />
                {custom && !isCyrillicFioInput(custom) ? (
                  <p className="text-sm text-destructive">{FIO_LATIN_REJECTED_TEXT}</p>
                ) : null}
                <Button
                  type="button"
                  disabled={props.busy || !isCyrillicFioInput(custom)}
                  onClick={() => {
                    setSelections((current) => ({
                      ...current,
                      [field]: { source: 'custom', value: custom.trim() },
                    }));
                    setCustomField(null);
                  }}
                >
                  Сохранить вариант
                </Button>
              </div>
            ) : null}
          </fieldset>
        );
      })}
      <Button
        type="button"
        disabled={props.busy || !ready}
        onClick={() => props.onConfirm(createHumanMergeDecision(props.prompt, selections))}
      >
        Объединить аккаунты
      </Button>
    </section>
  );
}
