"use client";

import { useActionState, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TestSet } from "@/modules/tests/types";
import { saveDoctorTestSetItems } from "./actions";
import type { SaveTestSetState } from "./actionsShared";

function linesFromSet(testSet: TestSet): string {
  return [...testSet.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => i.testId)
    .join("\n");
}

type Props = {
  testSet: TestSet;
};

export function TestSetItemsForm({ testSet }: Props) {
  const itemsKey = testSet.items
    .map((i) => `${i.testId}:${i.sortOrder}`)
    .sort()
    .join("|");

  const [localError, setLocalError] = useState<string | null>(null);

  const wrapped = useCallback(async (prev: SaveTestSetState | null, formData: FormData) => {
    setLocalError(null);
    const r = await saveDoctorTestSetItems(prev, formData);
    if (!r.ok && r.error) setLocalError(r.error);
    return r;
  }, []);

  const [last, formAction, pending] = useActionState(wrapped, null as SaveTestSetState | null);

  const initialLines = linesFromSet(testSet);

  return (
    <form
      key={`${testSet.id}:${itemsKey}`}
      action={formAction}
      className="flex max-w-2xl flex-col gap-3 rounded-lg border border-border/60 p-4"
    >
      <input type="hidden" name="setId" value={testSet.id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={`ts-items-${testSet.id}`}>Тесты в наборе (UUID по одному на строку)</Label>
        <Textarea
          id={`ts-items-${testSet.id}`}
          name="itemLines"
          defaultValue={initialLines}
          className="min-h-[160px] font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Сохраните состав отдельной кнопкой. Используйте только неархивные тесты из библиотеки.
        </p>
      </div>
      {localError ? (
        <p role="alert" className="text-sm text-destructive">
          {localError}
        </p>
      ) : null}
      {last?.ok ? <p className="text-sm text-muted-foreground">Состав сохранён.</p> : null}
      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Сохранение состава…" : "Сохранить состав"}
      </Button>
    </form>
  );
}
