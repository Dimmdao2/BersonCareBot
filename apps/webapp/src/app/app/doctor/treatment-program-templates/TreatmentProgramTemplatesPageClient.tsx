"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TreatmentProgramTemplate, TreatmentProgramTemplateDetail } from "@/modules/treatment-program/types";
import { cn } from "@/lib/utils";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import {
  DOCTOR_CATALOG_STICKY_BAR_CLASS,
  DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
} from "@/shared/ui/doctorWorkspaceLayout";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TreatmentProgramConstructorClient,
  type TreatmentProgramLibraryPickers,
} from "@/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient";

type Props = {
  templates: TreatmentProgramTemplate[];
  library: TreatmentProgramLibraryPickers;
  initialSelectedId: string | null;
};

type TitleSort = "default" | "asc" | "desc";

export function TreatmentProgramTemplatesPageClient({ templates, library, initialSelectedId }: Props) {
  const searchFieldId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [titleSort, setTitleSort] = useState<TitleSort>("default");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<TreatmentProgramTemplate | null>(null);
  const [detail, setDetail] = useState<TreatmentProgramTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      if (initialSelectedId) {
        const found = templates.find((t) => t.id === initialSelectedId);
        if (found) {
          setSelectedId(found.id);
          setMobileSheet(found);
        }
      }
    });
  }, [initialSelectedId, templates]);

  const displayList = useMemo(() => {
    let out = templates;
    const needle = normalizeRuSearchString(searchQuery.trim());
    if (needle) {
      out = out.filter((t) => normalizeRuSearchString(t.title).includes(needle));
    }
    if (titleSort === "asc" || titleSort === "desc") {
      out = [...out].sort((a, b) => {
        const cmp = a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
        return titleSort === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [templates, searchQuery, titleSort]);

  useEffect(() => {
    queueMicrotask(() => {
      if (displayList.length === 0) {
        setSelectedId(null);
        setMobileSheet(null);
        return;
      }
      setSelectedId((cur) => {
        if (cur != null && displayList.some((t) => t.id === cur)) return cur;
        return displayList[0]!.id;
      });
      setMobileSheet((prev) => {
        if (prev == null) return prev;
        const next = displayList.find((t) => t.id === prev.id);
        return next ?? null;
      });
    });
  }, [displayList]);

  const selected =
    displayList.find((t) => t.id === selectedId) ?? (displayList.length > 0 ? displayList[0]! : null);

  useEffect(() => {
    const id = selected?.id;
    if (!id) {
      queueMicrotask(() => {
        setDetail(null);
        setDetailError(null);
        setDetailLoading(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDetailLoading(true);
      setDetailError(null);
    });
    void fetch(`/api/doctor/treatment-program-templates/${id}`)
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          item?: TreatmentProgramTemplateDetail;
          error?: string;
        };
        if (cancelled) return;
        if (json.ok && json.item) {
          setDetail(json.item);
        } else {
          setDetail(null);
          setDetailError(json.error ?? "Не удалось загрузить шаблон");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
          setDetailError("Ошибка загрузки");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  const renderRows = (onPick: (t: TreatmentProgramTemplate) => void, activeId: string | null) =>
    displayList.length === 0 ? (
      <p className="px-2 pb-2 text-sm text-muted-foreground">Нет шаблонов по заданным условиям.</p>
    ) : (
      <ul className="flex max-h-[70vh] flex-col gap-1 overflow-auto lg:max-h-none lg:overflow-visible">
        {displayList.map((t) => {
          const active = activeId === t.id;
          return (
            <li key={t.id} className="rounded-md border border-border/40 bg-card/30">
              <button
                type="button"
                onClick={() => onPick(t)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted/80",
                  active &&
                    "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25",
                )}
              >
                <span className="line-clamp-2 font-medium leading-tight">{t.title}</span>
                <span
                  className={cn(
                    "text-xs uppercase tabular-nums",
                    active ? "text-primary/70" : "text-muted-foreground",
                  )}
                >
                  {t.status}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );

  const rightInner =
    detailLoading ? (
      <p className="text-sm text-muted-foreground">Загрузка конструктора…</p>
    ) : detailError ? (
      <p className="text-sm text-destructive">{detailError}</p>
    ) : detail && selected ? (
      <TreatmentProgramConstructorClient templateId={selected.id} initialDetail={detail} library={library} />
    ) : (
      <p className="text-sm text-muted-foreground">Выберите шаблон слева.</p>
    );

  const desktopRight = (
    <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">{rightInner}</CardContent>
    </Card>
  );

  const mobileDetailOpen = mobileSheet != null;

  const toolbar = (
    <div className={cn(DOCTOR_CATALOG_STICKY_BAR_CLASS, DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3">
        <p className="min-w-0 shrink-0 truncate text-xs text-muted-foreground">
          {displayList.length === 0 ? "Нет шаблонов" : `Шаблонов: ${displayList.length}`}
        </p>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-full sm:flex-row sm:items-end sm:justify-end">
          <PickerSearchField
            id={searchFieldId}
            label="Поиск по названию"
            placeholder="Название шаблона"
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="min-w-0 sm:max-w-[14rem] sm:flex-initial"
          />
          <div className="flex min-w-[11rem] max-w-full flex-col gap-1 sm:max-w-[14rem] sm:flex-initial">
            <span className="text-[11px] text-muted-foreground sm:sr-only">Сортировка</span>
            <Select value={titleSort} onValueChange={(v) => setTitleSort(v as TitleSort)}>
              <SelectTrigger size="sm" className="h-8 w-full text-left">
                <SelectValue>
                  {titleSort === "asc"
                    ? "Название А→Я"
                    : titleSort === "desc"
                      ? "Название Я→А"
                      : "Сортировка"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">По дате изменения</SelectItem>
                <SelectItem value="asc">Название А→Я</SelectItem>
                <SelectItem value="desc">Название Я→А</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <DoctorCatalogPageLayout toolbar={toolbar}>
      <CatalogSplitLayout
        left={
          <CatalogLeftPane>
            {renderRows((t) => {
              setSelectedId(t.id);
              setMobileSheet(t);
            }, selected?.id ?? mobileSheet?.id ?? null)}
          </CatalogLeftPane>
        }
        right={desktopRight}
        mobileView={mobileDetailOpen ? "detail" : "list"}
        mobileBackSlot={
          mobileDetailOpen ? (
            <Button variant="ghost" type="button" className="mb-2 h-9 px-2" onClick={() => setMobileSheet(null)}>
              ← Назад
            </Button>
          ) : null
        }
      />
    </DoctorCatalogPageLayout>
  );
}
