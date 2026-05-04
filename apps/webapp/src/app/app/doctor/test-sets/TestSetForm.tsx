"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TestSet, TestSetUsageSnapshot } from "@/modules/tests/types";
import type { DoctorCatalogPubArchQuery } from "@/shared/lib/doctorCatalogListStatus";
import { cn } from "@/lib/utils";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";
import {
  archiveDoctorTestSet,
  fetchDoctorTestSetUsageSnapshot,
  saveDoctorTestSet,
  saveDoctorTestSetItems,
  unarchiveDoctorTestSet,
} from "./actions";
import type { ArchiveTestSetState, SaveTestSetState, UnarchiveTestSetState } from "./actionsShared";
import { TEST_SETS_PATH } from "./paths";
import { TestSetItemsForm } from "./TestSetItemsForm";
import type { ClinicalTestLibraryPickRow } from "./clinicalTestLibraryRows";
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

type DraftItemRow = {
  sortId: string;
  testId: string;
  title: string;
  comment: string;
};

type Props = {
  testSet?: TestSet | null;
  backHref?: string;
  workspaceListPreserve?: {
    q?: string;
    titleSort?: "asc" | "desc" | null;
    regionCode?: string;
    listPubArch?: DoctorCatalogPubArchQuery;
  };
  saveAction?: (_prev: SaveTestSetState | null, formData: FormData) => Promise<SaveTestSetState>;
  archiveAction?: (
    _prev: ArchiveTestSetState | null,
    formData: FormData,
  ) => Promise<ArchiveTestSetState>;
  unarchiveAction?: (
    _prev: UnarchiveTestSetState | null,
    formData: FormData,
  ) => Promise<UnarchiveTestSetState>;
  externalUsageSnapshot?: TestSetUsageSnapshot;
  clinicalTestsLibrary?: ClinicalTestLibraryPickRow[];
  saveItemsAction?: (_prev: SaveTestSetState | null, formData: FormData) => Promise<SaveTestSetState>;
};

function WorkspaceListPreserveHidden({ w }: { w?: Props["workspaceListPreserve"] }) {
  if (!w?.listPubArch) return null;
  return (
    <>
      <input type="hidden" name="listArch" value={w.listPubArch.arch} />
      <input type="hidden" name="listPub" value={w.listPubArch.pub} />
    </>
  );
}

export function TestSetForm({
  testSet,
  backHref = TEST_SETS_PATH,
  workspaceListPreserve,
  saveAction = saveDoctorTestSet,
  archiveAction = archiveDoctorTestSet,
  unarchiveAction = unarchiveDoctorTestSet,
  externalUsageSnapshot,
  clinicalTestsLibrary = [],
  saveItemsAction = saveDoctorTestSetItems,
}: Props) {
  const recordKey = testSet?.id ?? "create";
  const [title, setTitle] = useState(testSet?.title ?? "");
  const [description, setDescription] = useState(testSet?.description ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const [usage, setUsage] = useState<TestSetUsageSnapshot | null>(null);
  const [usageLoadError, setUsageLoadError] = useState<string | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [archiveUsageAck, setArchiveUsageAck] = useState(false);
  const archiveFormRef = useRef<HTMLFormElement>(null);
  const [draftRows, setDraftRows] = useState<DraftItemRow[]>([]);
  const [draftPickOpen, setDraftPickOpen] = useState(false);
  const [draftPickQuery, setDraftPickQuery] = useState("");

  useEffect(() => {
    setTitle(testSet?.title ?? "");
    setDescription(testSet?.description ?? "");
    setLocalError(null);
    setUsageLoadError(null);
    setWarnOpen(false);
    setArchiveUsageAck(false);
    setDraftRows([]);
    setDraftPickOpen(false);
    setDraftPickQuery("");
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

  const [unarchiveState, unarchiveFormAction, unarchivePending] = useActionState(
    unarchiveAction,
    null as UnarchiveTestSetState | null,
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

  const unarchiveError =
    unarchiveState?.ok === false && "error" in unarchiveState ? unarchiveState.error : null;

  const isArchived = !!testSet?.isArchived;
  const canUseLibrary = clinicalTestsLibrary.length > 0;

  const draftItemsPayloadJson = useMemo(() => {
    const payload = draftRows.map((r) => ({
      testId: r.testId,
      comment: r.comment.trim() ? r.comment.trim() : null,
    }));
    return JSON.stringify(payload);
  }, [draftRows]);

  const draftFilteredPick = useMemo(() => {
    const needle = normalizeRuSearchString(draftPickQuery.trim());
    const used = new Set(draftRows.map((r) => r.testId));
    return clinicalTestsLibrary
      .filter((t) => !used.has(t.id) && (!needle || normalizeRuSearchString(t.title).includes(needle)))
      .sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }, [clinicalTestsLibrary, draftRows, draftPickQuery]);

  const addDraftTest = useCallback((row: ClinicalTestLibraryPickRow) => {
    setDraftRows((prev) => [
      ...prev,
      {
        sortId: crypto.randomUUID(),
        testId: row.id,
        title: row.title,
        comment: "",
      },
    ]);
    setDraftPickOpen(false);
    setDraftPickQuery("");
  }, []);

  const updateDraftComment = useCallback((sortId: string, comment: string) => {
    setDraftRows((prev) => prev.map((r) => (r.sortId === sortId ? { ...r, comment } : r)));
  }, []);

  const removeDraftRow = useCallback((sortId: string) => {
    setDraftRows((prev) => prev.filter((r) => r.sortId !== sortId));
  }, []);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {localError ? (
          <p role="alert" className="text-sm text-destructive">
            {localError}
          </p>
        ) : null}
        {testSet ? <input type="hidden" name="id" value={testSet.id} /> : null}
        {workspaceListPreserve?.q != null && workspaceListPreserve.q !== "" ? (
          <input type="hidden" name="listQ" value={workspaceListPreserve.q} />
        ) : null}
        {workspaceListPreserve?.titleSort === "asc" || workspaceListPreserve?.titleSort === "desc" ? (
          <input type="hidden" name="listTitleSort" value={workspaceListPreserve.titleSort} />
        ) : null}
        {workspaceListPreserve?.regionCode != null && workspaceListPreserve.regionCode !== "" ? (
          <input type="hidden" name="listRegion" value={workspaceListPreserve.regionCode} />
        ) : null}
        <WorkspaceListPreserveHidden w={workspaceListPreserve} />
        {!testSet && canUseLibrary ? (
          <input type="hidden" name="itemsPayload" value={draftItemsPayloadJson} readOnly />
        ) : null}
        <fieldset disabled={isArchived} className="m-0 min-w-0 border-0 p-0">
          <legend className="sr-only">Поля набора тестов</legend>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <Label htmlFor="ts-title">Название набора</Label>
              <Input
                id="ts-title"
                name="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-3">
              <Label htmlFor="ts-desc">Описание</Label>
              <Textarea
                id="ts-desc"
                name="description"
                className="min-h-[72px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ts-publication">Публикация</Label>
              <select
                id="ts-publication"
                name="publicationStatus"
                key={`pub-${recordKey}`}
                defaultValue={testSet?.publicationStatus ?? "draft"}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="draft">Черновик</option>
                <option value="published">Опубликован</option>
              </select>
            </div>
            {!testSet && canUseLibrary ? (
              <section className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <h2 className="text-base font-medium">Состав набора</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="secondary" onClick={() => setDraftPickOpen(true)}>
                    Добавить из библиотеки
                  </Button>
                  <p className="text-xs text-muted-foreground">Добавляйте тесты сразу, до первого сохранения набора.</p>
                </div>

                <Dialog open={draftPickOpen} onOpenChange={setDraftPickOpen}>
                  <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Тест из библиотеки</DialogTitle>
                    </DialogHeader>
                    <PickerSearchField
                      id={`ts-draft-lib-search-${recordKey}`}
                      label="Поиск по названию"
                      placeholder="Название теста"
                      value={draftPickQuery}
                      onValueChange={setDraftPickQuery}
                      className="min-w-0"
                    />
                    <ul className="max-h-56 overflow-auto rounded-md border">
                      {draftFilteredPick.length === 0 ? (
                        <li className="px-3 py-4 text-sm text-muted-foreground">Нет доступных тестов.</li>
                      ) : (
                        draftFilteredPick.map((row) => (
                          <li key={row.id} className="border-b last:border-0">
                            <button
                              type="button"
                              className="flex w-full gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                              onClick={() => addDraftTest(row)}
                            >
                              <span className="min-w-0 flex-1 self-center font-medium leading-snug">{row.title}</span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setDraftPickOpen(false)}>
                        Закрыть
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {draftRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Добавьте тесты из библиотеки или сохраните пустой набор.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {draftRows.map((r) => (
                      <li key={r.sortId} className="rounded-lg border border-border/70 bg-card p-3">
                        <p className="text-sm font-medium leading-tight">{r.title}</p>
                        <div className="mt-2 flex min-w-0 flex-col gap-1">
                          <Label className="text-xs" htmlFor={`ts-draft-cmt-${r.sortId}`}>
                            Комментарий к позиции
                          </Label>
                          <Textarea
                            id={`ts-draft-cmt-${r.sortId}`}
                            className="min-h-[56px] resize-y text-sm"
                            value={r.comment}
                            onChange={(ev) => updateDraftComment(r.sortId, ev.target.value)}
                          />
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeDraftRow(r.sortId)}>
                            Удалить из набора
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Сохранение…" : testSet ? "Сохранить" : "Создать черновик"}
              </Button>
              <Link href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
                К списку
              </Link>
            </div>
          </div>
        </fieldset>
      </form>

      {testSet && canUseLibrary ? (
        <section className="flex flex-col gap-2 border-t border-border/60 pt-4">
          <h2 className="text-lg font-medium">Состав набора</h2>
          {!testSet.isArchived ? (
            <TestSetItemsForm testSet={testSet} clinicalTestsLibrary={clinicalTestsLibrary} saveItemsAction={saveItemsAction} />
          ) : (
            <p className="text-sm text-muted-foreground">Состав недоступен, пока набор в архиве.</p>
          )}
        </section>
      ) : null}

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

          {isArchived ? (
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">Набор в архиве</p>
              <p className="mt-1 text-muted-foreground">Верните из архива, чтобы снова добавлять в программы.</p>
              {unarchiveError ? (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {unarchiveError}
                </p>
              ) : null}
              <form action={unarchiveFormAction} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="id" value={testSet.id} />
                {workspaceListPreserve?.q != null && workspaceListPreserve.q !== "" ? (
                  <input type="hidden" name="listQ" value={workspaceListPreserve.q} />
                ) : null}
                {workspaceListPreserve?.titleSort === "asc" || workspaceListPreserve?.titleSort === "desc" ? (
                  <input type="hidden" name="listTitleSort" value={workspaceListPreserve.titleSort} />
                ) : null}
                {workspaceListPreserve?.regionCode != null && workspaceListPreserve.regionCode !== "" ? (
                  <input type="hidden" name="listRegion" value={workspaceListPreserve.regionCode} />
                ) : null}
                <WorkspaceListPreserveHidden w={workspaceListPreserve} />
                <Button type="submit" variant="secondary" disabled={unarchivePending}>
                  {unarchivePending ? "Восстановление…" : "Вернуть из архива"}
                </Button>
              </form>
            </div>
          ) : (
            <>
          {archiveError ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {archiveError}
            </p>
          ) : null}

          <form ref={archiveFormRef} action={archiveFormAction} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={testSet.id} />
            {workspaceListPreserve?.q != null && workspaceListPreserve.q !== "" ? (
              <input type="hidden" name="listQ" value={workspaceListPreserve.q} />
            ) : null}
            {workspaceListPreserve?.titleSort === "asc" || workspaceListPreserve?.titleSort === "desc" ? (
              <input type="hidden" name="listTitleSort" value={workspaceListPreserve.titleSort} />
            ) : null}
            {workspaceListPreserve?.regionCode != null && workspaceListPreserve.regionCode !== "" ? (
              <input type="hidden" name="listRegion" value={workspaceListPreserve.regionCode} />
            ) : null}
            <WorkspaceListPreserveHidden w={workspaceListPreserve} />
            <input type="hidden" name="acknowledgeUsageWarning" value={archiveUsageAck ? "1" : ""} readOnly />
            <Button
              type="submit"
              variant="destructive"
              disabled={archivePending}
              onClick={() => {
                setArchiveUsageAck(false);
              }}
            >
              {archivePending ? "Архивация…" : "Архивировать набор"}
            </Button>
          </form>

          <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
            <DialogContent showCloseButton className="max-w-md">
              <DialogHeader>
                <DialogTitle>Набор уже используется</DialogTitle>
                <div className="space-y-2 text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground">
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
                </div>
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
                    setArchiveUsageAck(true);
                    setWarnOpen(false);
                    queueMicrotask(() => {
                      archiveFormRef.current?.requestSubmit();
                      setArchiveUsageAck(false);
                    });
                  }}
                >
                  Архивировать всё равно
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
