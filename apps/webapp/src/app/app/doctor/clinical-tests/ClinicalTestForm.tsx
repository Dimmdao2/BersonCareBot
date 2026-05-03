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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ClinicalTest, ClinicalTestUsageSnapshot } from "@/modules/tests/types";
import {
  CLINICAL_TEST_SCHEMA_TYPES,
  parseClinicalTestScoring,
  type ClinicalTestSchemaType,
  type ClinicalTestScoring,
} from "@/modules/tests/clinicalTestScoring";
import { buildClinicalAssessmentKindSelectOptions } from "@/modules/tests/clinicalTestAssessmentKind";
import { cn } from "@/lib/utils";
import { MediaLibraryPickerDialog } from "@/app/app/doctor/content/MediaLibraryPickerDialog";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import { archiveClinicalTest, fetchDoctorClinicalTestUsageSnapshot, saveClinicalTest, unarchiveClinicalTest } from "./actions";
import type {
  ArchiveClinicalTestState,
  SaveClinicalTestState,
  UnarchiveClinicalTestState,
} from "./actionsShared";
import {
  exerciseMediaTypeFromPick,
  exerciseTitleFromPickMeta,
} from "@/app/app/doctor/exercises/exerciseMediaFromLibrary";
import type { RecommendationListFilterScope } from "@/shared/lib/doctorCatalogListStatus";
import { CLINICAL_TESTS_PATH } from "./paths";
import { doctorClinicalTestUsageHref } from "./clinicalTestsUsageDocLinks";
import {
  clinicalTestUsageHasAnyReference,
  clinicalTestUsageSections,
  type ClinicalTestUsageSection,
} from "./clinicalTestsUsageSummaryText";
import {
  ClinicalTestMeasureRowsEditor,
  type ClinicalTestMeasureRowModel,
} from "./ClinicalTestMeasureRowsEditor";

export type ClinicalTestFormValues = {
  title: string;
  description: string;
  testType: string;
  tags: string;
  mediaUrl: string;
  mediaType: "" | "image" | "video" | "gif";
  assessmentKind: string;
  bodyRegionId: string | null;
  schemaType: ClinicalTestSchemaType;
  measureRows: ClinicalTestMeasureRowModel[];
  likertMin: string;
  likertMax: string;
  numericMin: string;
  numericMax: string;
  step: string;
  positiveLabel: string;
  negativeLabel: string;
  rawText: string;
  jsonMode: boolean;
  scoringJsonRaw: string;
};

export function clinicalTestToFormValues(test: ClinicalTest | null | undefined): ClinicalTestFormValues {
  const initialMedia = test?.media?.[0];
  const parsed = parseClinicalTestScoring(test?.scoring ?? null);
  const schemaType: ClinicalTestSchemaType =
    parsed && (CLINICAL_TEST_SCHEMA_TYPES as readonly string[]).includes(parsed.schema_type)
      ? parsed.schema_type
      : "qualitative";
  const measureRows: ClinicalTestMeasureRowModel[] = (parsed?.measure_items ?? []).map((m, idx) => ({
    id: `row-${idx}-${m.measureKind}`,
    measureKind: m.measureKind,
    value: m.value ?? "",
    unit: m.unit ?? "",
    comment: m.comment ?? "",
  }));

  let likertMin = "1";
  let likertMax = "5";
  let numericMin = "";
  let numericMax = "";
  let step = "";
  let positiveLabel = "";
  let negativeLabel = "";
  if (parsed?.schema_type === "likert") {
    likertMin = String(parsed.likert_min);
    likertMax = String(parsed.likert_max);
  }
  if (parsed?.schema_type === "numeric") {
    numericMin = parsed.min_value != null ? String(parsed.min_value) : "";
    numericMax = parsed.max_value != null ? String(parsed.max_value) : "";
    step = parsed.step != null ? String(parsed.step) : "";
  }
  if (parsed?.schema_type === "binary") {
    positiveLabel = parsed.positive_label ?? "";
    negativeLabel = parsed.negative_label ?? "";
  }

  const scoringJsonRaw =
    test?.scoring != null
      ? JSON.stringify(test.scoring, null, 2)
      : test?.scoringConfig != null
        ? JSON.stringify(test.scoringConfig, null, 2)
        : "";

  return {
    title: test?.title ?? "",
    description: test?.description ?? "",
    testType: test?.testType ?? "",
    tags: test?.tags?.join(", ") ?? "",
    mediaUrl: initialMedia?.mediaUrl ?? "",
    mediaType: (initialMedia?.mediaType ?? "") as ClinicalTestFormValues["mediaType"],
    assessmentKind: test?.assessmentKind ?? "",
    bodyRegionId: test?.bodyRegionId ?? null,
    schemaType,
    measureRows,
    likertMin,
    likertMax,
    numericMin,
    numericMax,
    step,
    positiveLabel,
    negativeLabel,
    rawText: test?.rawText ?? "",
    jsonMode: false,
    scoringJsonRaw,
  };
}

function buildStructuredScoring(v: ClinicalTestFormValues): ClinicalTestScoring {
  const measure_items = v.measureRows
    .map((r, idx) => ({
      measureKind: r.measureKind.trim(),
      value: r.value.trim() || null,
      unit: r.unit.trim() || null,
      comment: r.comment.trim() || null,
      sortOrder: idx,
    }))
    .filter((m) => m.measureKind.length > 0);

  const st = v.schemaType;
  if (st === "qualitative") return { schema_type: "qualitative", measure_items };
  if (st === "binary") {
    return {
      schema_type: "binary",
      measure_items,
      positive_label: v.positiveLabel.trim() || undefined,
      negative_label: v.negativeLabel.trim() || undefined,
    };
  }
  if (st === "numeric") {
    const min_v = v.numericMin.trim() ? Number(v.numericMin) : undefined;
    const max_v = v.numericMax.trim() ? Number(v.numericMax) : undefined;
    const step_v = v.step.trim() ? Number(v.step) : undefined;
    if (min_v !== undefined && !Number.isFinite(min_v)) throw new Error("Некорректный min");
    if (max_v !== undefined && !Number.isFinite(max_v)) throw new Error("Некорректный max");
    if (step_v !== undefined && (!Number.isFinite(step_v) || step_v <= 0)) throw new Error("Некорректный step");
    return {
      schema_type: "numeric",
      measure_items,
      min_value: min_v,
      max_value: max_v,
      step: step_v,
    };
  }
  const lo = Number.parseInt(v.likertMin, 10);
  const hi = Number.parseInt(v.likertMax, 10);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error("Укажите шкалу Ликерта (целые числа)");
  return { schema_type: "likert", measure_items, likert_min: lo, likert_max: hi };
}

function ClinicalTestUsageSectionsView({ sections }: { sections: ClinicalTestUsageSection[] }) {
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
                    href={doctorClinicalTestUsageHref(r)}
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

type ClinicalTestFormProps = {
  test?: ClinicalTest | null;
  backHref?: string;
  /** Режим каталога master-detail — передаётся в форму как `catalogView` для редиректа после сохранения. */
  workspaceView?: "tiles" | "list";
  /** Дополнить редирект после save/archive параметрами списка (`q`, `titleSort`, `region`, `load`). */
  workspaceListPreserve?: {
    q?: string;
    titleSort?: "asc" | "desc" | null;
    regionRefId?: string;
    assessmentKind?: string | null;
    listStatus?: RecommendationListFilterScope;
  };
  /**
   * Опции «Вид оценки» из справочника БД (+ read-tolerant legacy).
   * Если не передано — строится из сида v1 и текущего `test.assessmentKind`.
   */
  assessmentKindSelectOptions?: Array<{ code: string; title: string }>;
  saveAction?: (
    _prev: SaveClinicalTestState | null,
    formData: FormData,
  ) => Promise<SaveClinicalTestState>;
  archiveAction?: (
    _prev: ArchiveClinicalTestState | null,
    formData: FormData,
  ) => Promise<ArchiveClinicalTestState>;
  unarchiveAction?: (
    _prev: UnarchiveClinicalTestState | null,
    formData: FormData,
  ) => Promise<UnarchiveClinicalTestState>;
  /**
   * Snapshot с сервера (например split-view с выбранным тестом). Если не передан — usage
   * подгружается через `fetchDoctorClinicalTestUsageSnapshot`.
   */
  externalUsageSnapshot?: ClinicalTestUsageSnapshot;
};

export function ClinicalTestForm({
  test,
  backHref = CLINICAL_TESTS_PATH,
  workspaceView,
  workspaceListPreserve,
  assessmentKindSelectOptions: assessmentKindSelectOptionsProp,
  saveAction = saveClinicalTest,
  archiveAction = archiveClinicalTest,
  unarchiveAction = unarchiveClinicalTest,
  externalUsageSnapshot,
}: ClinicalTestFormProps) {
  const recordKey = test?.id ?? "create";
  const [values, setValues] = useState<ClinicalTestFormValues>(() => clinicalTestToFormValues(test));
  const [localError, setLocalError] = useState<string | null>(null);
  const [usage, setUsage] = useState<ClinicalTestUsageSnapshot | null>(null);
  const [usageLoadError, setUsageLoadError] = useState<string | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [archiveUsageAck, setArchiveUsageAck] = useState(false);
  const archiveFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setValues(clinicalTestToFormValues(test));
    setLocalError(null);
    setUsageLoadError(null);
    setWarnOpen(false);
    setArchiveUsageAck(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- сброс при смене записи
  }, [recordKey]);

  useEffect(() => {
    if (!test?.id) {
      setUsage(null);
      return;
    }
    if (externalUsageSnapshot !== undefined) {
      setUsage(externalUsageSnapshot);
      return;
    }
    let cancelled = false;
    setUsageBusy(true);
    void fetchDoctorClinicalTestUsageSnapshot(test.id)
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
  }, [test?.id, externalUsageSnapshot]);

  const wrappedSave = useCallback(
    async (prev: SaveClinicalTestState | null, formData: FormData) => {
      setLocalError(null);
      const r = await saveAction(prev, formData);
      if (!r.ok && r.error) setLocalError(r.error);
      return r;
    },
    [saveAction],
  );

  const [, formAction, savePending] = useActionState(wrappedSave, null as SaveClinicalTestState | null);

  const [archiveState, archiveFormAction, archivePending] = useActionState(
    archiveAction,
    null as ArchiveClinicalTestState | null,
  );

  const [unarchiveState, unarchiveFormAction, unarchivePending] = useActionState(
    unarchiveAction,
    null as UnarchiveClinicalTestState | null,
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
    if (!usage || !clinicalTestUsageHasAnyReference(usage)) return [];
    return clinicalTestUsageSections(usage);
  }, [usage]);

  const assessmentKindSelectOptions = useMemo(
    () =>
      assessmentKindSelectOptionsProp ??
      buildClinicalAssessmentKindSelectOptions([], test?.assessmentKind ?? null),
    [assessmentKindSelectOptionsProp, test?.assessmentKind],
  );

  const warnSections = useMemo(() => {
    if (
      archiveState?.ok === false &&
      "code" in archiveState &&
      archiveState.code === "USAGE_CONFIRMATION_REQUIRED"
    ) {
      const u = archiveState.usage;
      if (!clinicalTestUsageHasAnyReference(u)) return [];
      return clinicalTestUsageSections(u);
    }
    return [];
  }, [archiveState]);

  const archiveError =
    archiveState?.ok === false && "error" in archiveState ? archiveState.error : null;

  const unarchiveError =
    unarchiveState?.ok === false && "error" in unarchiveState ? unarchiveState.error : null;

  const isArchived = !!test?.isArchived;

  const clinicalStructuredJson = useMemo(() => {
    if (values.jsonMode) return "";
    try {
      return JSON.stringify(buildStructuredScoring(values));
    } catch {
      return "";
    }
  }, [values]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {localError ? (
          <p role="alert" className="text-sm text-destructive">
            {localError}
          </p>
        ) : null}
        {test ? <input type="hidden" name="id" value={test.id} /> : null}
        {workspaceView ? <input type="hidden" name="catalogView" value={workspaceView} /> : null}
        {workspaceListPreserve?.q != null && workspaceListPreserve.q !== "" ? (
          <input type="hidden" name="listQ" value={workspaceListPreserve.q} />
        ) : null}
        {workspaceListPreserve?.titleSort === "asc" || workspaceListPreserve?.titleSort === "desc" ? (
          <input type="hidden" name="listTitleSort" value={workspaceListPreserve.titleSort} />
        ) : null}
        {workspaceListPreserve?.regionRefId != null && workspaceListPreserve.regionRefId !== "" ? (
          <input type="hidden" name="listRegion" value={workspaceListPreserve.regionRefId} />
        ) : null}
        {workspaceListPreserve?.assessmentKind != null && workspaceListPreserve.assessmentKind !== "" ? (
          <input type="hidden" name="listAssessment" value={workspaceListPreserve.assessmentKind} />
        ) : null}
        {workspaceListPreserve?.listStatus != null ? (
          <input type="hidden" name="listStatus" value={workspaceListPreserve.listStatus} />
        ) : null}
        <input type="hidden" name="scoringEditorMode" value={values.jsonMode ? "json" : "structured"} readOnly />
        <input type="hidden" name="clinicalScoringJson" value={values.jsonMode ? "" : clinicalStructuredJson} readOnly />
        {!values.jsonMode ? <input type="hidden" name="scoringJsonRaw" value="" readOnly /> : null}
        <input type="hidden" name="mediaUrl" value={values.mediaUrl} />
        <input type="hidden" name="mediaType" value={values.mediaType} />

        <fieldset disabled={isArchived} className="m-0 min-w-0 border-0 p-0">
          <legend className="sr-only">Поля клинического теста</legend>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <Label htmlFor="ct-title">Название</Label>
              <Input
                id="ct-title"
                name="title"
                required
                value={values.title}
                onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-sm font-medium">Медиа</span>
              <MediaLibraryPickerDialog
                kind="image_or_video"
                value={values.mediaUrl}
                selectedPreviewKind={values.mediaType || undefined}
                pickerTitle="Изображение, GIF или видео"
                onChange={(url, meta) => {
                  setValues((prev) => {
                    let nextTitle = prev.title;
                    let nextType: ClinicalTestFormValues["mediaType"] = "";
                    if (url && meta) {
                      nextType = exerciseMediaTypeFromPick(meta);
                      if (nextTitle.trim() === "") nextTitle = exerciseTitleFromPickMeta(meta);
                    }
                    return { ...prev, mediaUrl: url, mediaType: nextType, title: nextTitle };
                  });
                }}
              />
            </div>

            <div className="flex flex-col gap-3">
              <Label htmlFor="ct-desc">Описание</Label>
              <Textarea
                id="ct-desc"
                name="description"
                className="min-h-[80px]"
                value={values.description}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-3">
              <Label htmlFor="ct-type">Тип теста (произвольная метка)</Label>
              <Input
                id="ct-type"
                name="testType"
                value={values.testType}
                onChange={(e) => setValues((v) => ({ ...v, testType: e.target.value }))}
                placeholder="например screening"
              />
            </div>

            <div className="flex flex-col gap-3">
              <Label htmlFor="ct-asm">Вид оценки</Label>
              <select
                id="ct-asm"
                name="assessmentKind"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={values.assessmentKind}
                onChange={(e) => setValues((v) => ({ ...v, assessmentKind: e.target.value }))}
              >
                <option value="">Не выбран</option>
                {assessmentKindSelectOptions.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.title}
                  </option>
                ))}
              </select>
              {assessmentKindSelectOptions.some((o) => o.title.includes("(не в справочнике)")) ? (
                <p className="text-xs text-muted-foreground">
                  Код вида оценки не найден в справочнике. Можно сохранить остальные поля без смены этого значения; чтобы записать другой вид — выберите код из списка.
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <Label htmlFor="ct-region">Регион тела</Label>
              <ReferenceSelect
                id="ct-region"
                name="bodyRegionId"
                categoryCode="body_region"
                value={values.bodyRegionId}
                onChange={(refId) => setValues((v) => ({ ...v, bodyRegionId: refId }))}
                placeholder="Не выбран"
                clearOptionLabel="Все / не задано"
                disabled={isArchived}
              />
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-border/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">Оценка</span>
                <div className="flex items-center gap-2">
                  <Switch
                    id="ct-json-mode"
                    checked={values.jsonMode}
                    onCheckedChange={(c) => setValues((v) => ({ ...v, jsonMode: !!c }))}
                    disabled={isArchived}
                  />
                  <Label htmlFor="ct-json-mode" className="text-sm font-normal">
                    JSON-режим
                  </Label>
                </div>
              </div>

              {values.jsonMode ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ct-scoring-json">scoring (JSON)</Label>
                  <Textarea
                    id="ct-scoring-json"
                    name="scoringJsonRaw"
                    className="min-h-[220px] font-mono text-sm"
                    value={values.scoringJsonRaw}
                    onChange={(e) => setValues((v) => ({ ...v, scoringJsonRaw: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <Label>Тип шкалы</Label>
                    <Select
                      value={values.schemaType}
                      onValueChange={(v) =>
                        setValues((prev) => ({
                          ...prev,
                          schemaType:
                            typeof v === "string" &&
                            (CLINICAL_TEST_SCHEMA_TYPES as readonly string[]).includes(v)
                              ? (v as ClinicalTestSchemaType)
                              : "qualitative",
                        }))
                      }
                    >
                      <SelectTrigger className="w-full sm:max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="numeric">Числовая</SelectItem>
                        <SelectItem value="likert">Ликерт</SelectItem>
                        <SelectItem value="binary">Да/Нет</SelectItem>
                        <SelectItem value="qualitative">Качественная (вручную)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {values.schemaType === "numeric" ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Min</Label>
                        <Input
                          value={values.numericMin}
                          onChange={(e) => setValues((v) => ({ ...v, numericMin: e.target.value }))}
                          inputMode="decimal"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Max</Label>
                        <Input
                          value={values.numericMax}
                          onChange={(e) => setValues((v) => ({ ...v, numericMax: e.target.value }))}
                          inputMode="decimal"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Шаг</Label>
                        <Input
                          value={values.step}
                          onChange={(e) => setValues((v) => ({ ...v, step: e.target.value }))}
                          inputMode="decimal"
                        />
                      </div>
                    </div>
                  ) : null}

                  {values.schemaType === "likert" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Минимум шкалы</Label>
                        <Input
                          value={values.likertMin}
                          onChange={(e) => setValues((v) => ({ ...v, likertMin: e.target.value }))}
                          inputMode="numeric"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Максимум шкалы</Label>
                        <Input
                          value={values.likertMax}
                          onChange={(e) => setValues((v) => ({ ...v, likertMax: e.target.value }))}
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                  ) : null}

                  {values.schemaType === "binary" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Подпись «да»</Label>
                        <Input
                          value={values.positiveLabel}
                          onChange={(e) => setValues((v) => ({ ...v, positiveLabel: e.target.value }))}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Подпись «нет»</Label>
                        <Input
                          value={values.negativeLabel}
                          onChange={(e) => setValues((v) => ({ ...v, negativeLabel: e.target.value }))}
                        />
                      </div>
                    </div>
                  ) : null}

                  <ClinicalTestMeasureRowsEditor
                    disabled={isArchived}
                    rows={values.measureRows}
                    setRows={(next) =>
                      setValues((v) => ({
                        ...v,
                        measureRows: typeof next === "function" ? next(v.measureRows) : next,
                      }))
                    }
                  />

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ct-raw">Свободный текст / fallback</Label>
                    <Textarea
                      id="ct-raw"
                      name="rawText"
                      className="min-h-[72px]"
                      value={values.rawText}
                      onChange={(e) => setValues((v) => ({ ...v, rawText: e.target.value }))}
                      placeholder="Заметки, legacy-данные, что не вошло в структуру"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <Label htmlFor="ct-tags">Теги (через запятую)</Label>
              <Input
                id="ct-tags"
                name="tags"
                value={values.tags}
                onChange={(e) => setValues((v) => ({ ...v, tags: e.target.value }))}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={savePending}>
                {savePending ? "Сохранение…" : test ? "Сохранить" : "Создать тест"}
              </Button>
              <Link href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
                К списку
              </Link>
            </div>
          </div>
        </fieldset>
      </form>

      {test ? (
        <div className="border-t border-border/60 pt-4">
          <div className="mb-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Где используется</p>
            {usageBusy ? (
              <p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>
            ) : usageLoadError ? (
              <p className="mt-1 text-sm text-muted-foreground">{usageLoadError}</p>
            ) : !usage ? null : !clinicalTestUsageHasAnyReference(usage) ? (
              <p className="mt-1 text-sm text-muted-foreground">Пока не используется</p>
            ) : (
              <ClinicalTestUsageSectionsView sections={usageSections} />
            )}
          </div>

          {isArchived ? (
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">Тест в архиве</p>
              <p className="mt-1 text-muted-foreground">Верните из архива, чтобы снова добавлять в наборы и шаблоны.</p>
              {unarchiveError ? (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {unarchiveError}
                </p>
              ) : null}
              <form action={unarchiveFormAction} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="id" value={test.id} />
                {workspaceView ? <input type="hidden" name="catalogView" value={workspaceView} /> : null}
                {workspaceListPreserve?.q != null && workspaceListPreserve.q !== "" ? (
                  <input type="hidden" name="listQ" value={workspaceListPreserve.q} />
                ) : null}
                {workspaceListPreserve?.titleSort === "asc" || workspaceListPreserve?.titleSort === "desc" ? (
                  <input type="hidden" name="listTitleSort" value={workspaceListPreserve.titleSort} />
                ) : null}
                {workspaceListPreserve?.regionRefId != null && workspaceListPreserve.regionRefId !== "" ? (
                  <input type="hidden" name="listRegion" value={workspaceListPreserve.regionRefId} />
                ) : null}
                {workspaceListPreserve?.assessmentKind != null && workspaceListPreserve.assessmentKind !== "" ? (
                  <input type="hidden" name="listAssessment" value={workspaceListPreserve.assessmentKind} />
                ) : null}
                {workspaceListPreserve?.listStatus != null ? (
                  <input type="hidden" name="listStatus" value={workspaceListPreserve.listStatus} />
                ) : null}
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
            <input type="hidden" name="id" value={test.id} />
            {workspaceView ? <input type="hidden" name="catalogView" value={workspaceView} /> : null}
            {workspaceListPreserve?.q != null && workspaceListPreserve.q !== "" ? (
              <input type="hidden" name="listQ" value={workspaceListPreserve.q} />
            ) : null}
            {workspaceListPreserve?.titleSort === "asc" || workspaceListPreserve?.titleSort === "desc" ? (
              <input type="hidden" name="listTitleSort" value={workspaceListPreserve.titleSort} />
            ) : null}
            {workspaceListPreserve?.regionRefId != null && workspaceListPreserve.regionRefId !== "" ? (
              <input type="hidden" name="listRegion" value={workspaceListPreserve.regionRefId} />
            ) : null}
            {workspaceListPreserve?.assessmentKind != null && workspaceListPreserve.assessmentKind !== "" ? (
              <input type="hidden" name="listAssessment" value={workspaceListPreserve.assessmentKind} />
            ) : null}
            {workspaceListPreserve?.listStatus != null ? (
              <input type="hidden" name="listStatus" value={workspaceListPreserve.listStatus} />
            ) : null}
            <input type="hidden" name="acknowledgeUsageWarning" value={archiveUsageAck ? "1" : ""} readOnly />
            <Button
              type="submit"
              variant="destructive"
              disabled={archivePending}
              onClick={() => {
                setArchiveUsageAck(false);
              }}
            >
              {archivePending ? "Архивация…" : "Архивировать"}
            </Button>
          </form>

          <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
            <DialogContent showCloseButton className="max-w-md">
              <DialogHeader>
                <DialogTitle>Элемент уже используется</DialogTitle>
                <div className="space-y-2 text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground">
                  <span className="block">
                    Архивация уберёт тест из каталога для новых наборов и шаблонов. Уже выданные программы и история
                    результатов не удаляются.
                  </span>
                  {!warnSections.length &&
                  archiveState?.ok === false &&
                  "code" in archiveState &&
                  archiveState.code === "USAGE_CONFIRMATION_REQUIRED" &&
                  !clinicalTestUsageHasAnyReference(archiveState.usage) ? (
                    <span className="block text-sm">
                      Тест помечен как используемый — проверьте связи перед архивацией.
                    </span>
                  ) : warnSections.length ? (
                    <ClinicalTestUsageSectionsView sections={warnSections} />
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
