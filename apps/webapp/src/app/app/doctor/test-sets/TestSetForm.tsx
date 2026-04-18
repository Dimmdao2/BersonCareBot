"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TestSet } from "@/modules/tests/types";
import { cn } from "@/lib/utils";
import { archiveDoctorTestSet, saveDoctorTestSet } from "./actions";
import type { SaveTestSetState } from "./actionsShared";
import { TEST_SETS_PATH } from "./paths";

type Props = {
  testSet?: TestSet | null;
  backHref?: string;
};

export function TestSetForm({ testSet, backHref = TEST_SETS_PATH }: Props) {
  const recordKey = testSet?.id ?? "create";
  const [title, setTitle] = useState(testSet?.title ?? "");
  const [description, setDescription] = useState(testSet?.description ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(testSet?.title ?? "");
    setDescription(testSet?.description ?? "");
    setLocalError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordKey]);

  const wrappedSave = useCallback(async (prev: SaveTestSetState | null, formData: FormData) => {
    setLocalError(null);
    const r = await saveDoctorTestSet(prev, formData);
    if (!r.ok && r.error) setLocalError(r.error);
    return r;
  }, []);

  const [, formAction, pending] = useActionState(wrappedSave, null as SaveTestSetState | null);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        {localError ? (
          <p role="alert" className="text-sm text-destructive">
            {localError}
          </p>
        ) : null}
        {testSet ? <input type="hidden" name="id" value={testSet.id} /> : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="ts-title">Название набора</Label>
          <Input
            id="ts-title"
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ts-desc">Описание</Label>
          <Textarea
            id="ts-desc"
            name="description"
            className="min-h-[72px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение…" : testSet ? "Сохранить" : "Создать набор"}
          </Button>
          <Link href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
            К списку
          </Link>
        </div>
      </form>

      {testSet ? (
        <form action={archiveDoctorTestSet} className="border-t border-border/60 pt-4">
          <input type="hidden" name="id" value={testSet.id} />
          <Button type="submit" variant="destructive">
            Архивировать набор
          </Button>
        </form>
      ) : null}
    </div>
  );
}
