"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TestSet, TestSetUsageSnapshot } from "@/modules/tests/types";
import { cn } from "@/lib/utils";
import { archiveDoctorTestSet, fetchDoctorTestSetUsageSnapshot, saveDoctorTestSet } from "./actions";
import type { ArchiveTestSetState, SaveTestSetState } from "./actionsShared";
import { TEST_SETS_PATH } from "./paths";
import { doctorTestSetUsageHref } from "./testSetUsageDocLinks";
import {
  testSetUsageHasAnyReference,
  testSetUsageSections,
  type TestSetUsageSection,
} from "./testSetUsageSummaryText";

function TestSetUsageSectionsView({ sections }: { sections: TestSetUsageSection[] }) {
  if (sections.length === 0) {
    return <p className="mt-1 text-sm text-muted-foreground">Пока не используется</p>;
  }
  return (
    <div className="mt-2 space-y-3">
      {sections.map((sec) => (
        <div key={sec.key}>
          <p className="text-sm text-muted-foreground">{sec.summary}</p>
          {sec.refs.length > 0 ? (
            <ul className="mt-1 ml-3 list-disc space-y-0.5 text-sm">
              {sec.refs.map((r) => (
                <li key={`${sec.key}-${r.kind}-${r.id}`}>
                  <Link
                    href={doctorTestSetUsageHref(r)}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {sec.refs.length > 0 && sec.total > sec.refs.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Показаны первые {sec.refs.length} из {sec.total}.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

type Props = {
  testSet?: TestSet | null;
  backHref?: string;
  saveAction?: (_prev: SaveTestSetState | null, formData: FormData) => Promise<SaveTestSetState>;
  archiveAction?: (
    _prev: ArchiveTestSetState | null,
    formData: FormData,
  ) => Promise<ArchiveTestSetState>;
  externalUsageSnapshot?: TestSetUsageSnapshot;
};

export function TestSetForm({
  testSet,
  backHref = TEST_SETS_PATH,
  saveAction = saveDoctorTestSet,
  archiveAction = archiveDoctorTestSet,
  externalUsageSnapshot,
}: Props) {
  const recordKey = testSet?.id ?? "create";
  const [title, setTitle] = useState(testSet?.title ?? "");
  const [description, setDescription] = useState(testSet?.description ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const [usage, setUsage] = useState<TestSetUsageSnapshot | null>(null);
  const [usageLoadError, setUsageLoadError] = useState<string | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const archiveFormRef = useRef<HTMLFormElement>(null);
  const acknowledgeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(testSet?.title ?? "");
    setDescription(testSet?.description ?? "");
    setLocalError(null);
    setUsageLoadError(null);
    setWarnOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordKey]);

  useEffect(() => {
    if (!testSet?.id) {
      setUsage(null);
      return;
    }
    if (externalUsageSnapshot !== undefined) {
      setUsage(externalUsageSnapshot);
      return;
    }
    let cancelled = false;
    setUsageBusy(true);
    void fetchDoctorTestSetUsageSnapshot(testSet.id)
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch(() => {
        if (!cancelled) {
          setUsage(null);
          setUsageLoadError("Не удалось загрузить сводку использования");
        }
      })
      .finally(() => {
        if (!cancelled) setUsageBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [testSet?.id, externalUsageSnapshot]);

  const wrappedSave = useCallback(
    async (prev: SaveTestSetState | null, formData: FormData) => {
      setLocalError(null);
      const r = await saveAction(prev, formData);
      if (!r.ok && r.error) setLocalError(r.error);
      return r;
    },
    [saveAction],
  );

  const [, formAction, pending] = useActionState(wrappedSave, null as SaveTestSetState | null);

  const [archiveState, archiveFormAction, archivePending] = useActionState(
    archiveAction,
    null as ArchiveTestSetState | null,
  );

  useEffect(() => {
    if (
      archiveState?.ok === false &&
      "code" in archiveState &&
      archiveState.code === "USAGE_CONFIRMATION_REQUIRED"
    ) {
      setWarnOpen(true);
    }
  }, [archiveState]);

  const usageSections = useMemo(() => {
    if (!usage || !testSetUsageHasAnyReference(usage)) return [];
    return testSetUsageSections(usage);
  }, [usage]);

  const warnSections = useMemo(() => {
    if (
      archiveState?.ok === false &&
      "code" in archiveState &&
      archiveState.code === "USAGE_CONFIRMATION_REQUIRED"
    ) {
      const u = archiveState.usage;
      if (!testSetUsageHasAnyReference(u)) return [];
      return testSetUsageSections(u);
    }
    return [];
  }, [archiveState]);

  const archiveError =
    archiveState?.ok === false && "error" in archiveState ? archiveState.error : null;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
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
        <div className="border-t border-border/60 pt-4">
          <div className="mb-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Где используется</p>
            {usageBusy ? (
              <p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>
            ) : usageLoadError ? (
              <p className="mt-1 text-sm text-muted-foreground">{usageLoadError}</p>
            ) : !usage ? null : !testSetUsageHasAnyReference(usage) ? (
              <p className="mt-1 text-sm text-muted-foreground">Пока не используется</p>
            ) : (
              <TestSetUsageSectionsView sections={usageSections} />
            )}
          </div>

          {archiveError ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {archiveError}
            </p>
          ) : null}

          <form ref={archiveFormRef} action={archiveFormAction} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={testSet.id} />
            <input ref={acknowledgeRef} type="hidden" name="acknowledgeUsageWarning" value="" />
            <Button
              type="submit"
              variant="destructive"
              disabled={archivePending}
              onClick={() => {
                if (acknowledgeRef.current) acknowledgeRef.current.value = "";
              }}
            >
              {archivePending ? "Архивация…" : "Архивировать набор"}
            </Button>
          </form>

          <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
            <DialogContent showCloseButton className="max-w-md">
              <DialogHeader>
                <DialogTitle>Набор уже используется</DialogTitle>
                <DialogDescription className="space-y-2">
                  <span className="block">
                    Архивация уберёт набор из каталога для новых программ. Уже выданные программы и история попыток не
                    удаляются.
                  </span>
                  {!warnSections.length &&
                  archiveState?.ok === false &&
                  "code" in archiveState &&
                  archiveState.code === "USAGE_CONFIRMATION_REQUIRED" &&
                  !testSetUsageHasAnyReference(archiveState.usage) ? (
                    <span className="block text-sm">
                      Набор помечен как используемый — проверьте связи перед архивацией.
                    </span>
                  ) : warnSections.length ? (
                    <TestSetUsageSectionsView sections={warnSections} />
                  ) : null}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="outline" onClick={() => setWarnOpen(false)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={archivePending}
                  onClick={() => {
                    if (acknowledgeRef.current) acknowledgeRef.current.value = "1";
                    setWarnOpen(false);
                    queueMicrotask(() => archiveFormRef.current?.requestSubmit());
                  }}
                >
                  Архивировать всё равно
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
}
