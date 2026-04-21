"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TreatmentProgramTemplate, TreatmentProgramTemplateDetail } from "@/modules/treatment-program/types";
import { cn } from "@/lib/utils";
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
import { useDoctorCatalogMasterSelectionSync } from "@/shared/hooks/useDoctorCatalogMasterSelectionSync";
import type { CatalogMasterTitleSort } from "@/shared/ui/doctor/DoctorCatalogMasterListHeader";
import { DoctorCatalogListSortHeader } from "@/shared/ui/doctor/DoctorCatalogListSortHeader";
import type { TitleSortValue } from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";
import {
  doctorCatalogToolbarPrimaryActionClassName,
  DoctorCatalogFiltersToolbar,
} from "@/shared/ui/doctor/DoctorCatalogFiltersToolbar";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import {
  TreatmentProgramConstructorClient,
  type TreatmentProgramLibraryPickers,
} from "./[id]/TreatmentProgramConstructorClient";
import { NewTemplateForm } from "./new/NewTemplateForm";
import { TREATMENT_PROGRAM_TEMPLATES_PATH } from "./paths";

type Props = {
  templates: TreatmentProgramTemplate[];
  library: TreatmentProgramLibraryPickers;
  initialSelectedId: string | null;
};

export function TreatmentProgramTemplatesPageClient({ templates, library, initialSelectedId }: Props) {
  const searchFieldId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [titleSort, setTitleSort] = useState<TitleSortValue>("default");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<TreatmentProgramTemplate | null>(null);
  const [detail, setDetail] = useState<TreatmentProgramTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailFetchGenRef = useRef(0);

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

  const displayList = useDoctorCatalogDisplayList(templates, searchQuery, titleSort);

  useDoctorCatalogMasterSelectionSync({
    displayList,
    setSelectedId,
    setMobileItem: setMobileSheet,
    fallbackToFirst: false,
  });

  const selected = displayList.find((t) => t.id === selectedId) ?? null;

  const titleSortForHeader: CatalogMasterTitleSort | null =
    titleSort === "asc" || titleSort === "desc" ? titleSort : null;

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
    const gen = ++detailFetchGenRef.current;
    const ac = new AbortController();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || gen !== detailFetchGenRef.current) return;
      setDetailLoading(true);
      setDetailError(null);
    });
    void fetch(`/api/doctor/treatment-program-templates/${id}`, { signal: ac.signal })
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          item?: TreatmentProgramTemplateDetail;
          error?: string;
        };
        if (cancelled || gen !== detailFetchGenRef.current) return;
        if (json.ok && json.item) {
          setDetail(json.item);
        } else {
          setDetail(null);
          setDetailError(json.error ?? "Не удалось загрузить шаблон");
        }
      })
      .catch((err: unknown) => {
        if (cancelled || gen !== detailFetchGenRef.current) return;
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (aborted) return;
        setDetail(null);
        setDetailError("Ошибка загрузки");
      })
      .finally(() => {
        if (cancelled || gen !== detailFetchGenRef.current) return;
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [selected?.id]);

  const renderRows = (onPick: (t: TreatmentProgramTemplate) => void, activeId: string | null) =>
    displayList.length === 0 ? (
      <p className="text-sm text-muted-foreground">Нет шаблонов по заданным условиям.</p>
    ) : (
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
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
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">Новый шаблон программы</p>
        <p className="text-sm text-muted-foreground">Задайте название и откройте конструктор этапов.</p>
        <NewTemplateForm showCancelLink={false} titleInputId="tpl-title-catalog-inline" />
      </div>
    );

  const desktopRight = <CatalogRightPane>{rightInner}</CatalogRightPane>;

  const mobileDetailOpen = mobileSheet != null;

  const toolbar = (
    <DoctorCatalogFiltersToolbar
      filters={
        <div className="w-[220px] shrink-0">
          <label htmlFor={searchFieldId} className="sr-only">
            Поиск по названию
          </label>
          <Input
            id={searchFieldId}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию"
            autoComplete="off"
            className="w-full"
          />
        </div>
      }
      end={
        <Link href={`${TREATMENT_PROGRAM_TEMPLATES_PATH}/new`} className={doctorCatalogToolbarPrimaryActionClassName}>
          Создать
        </Link>
      }
    />
  );

  return (
    <DoctorCatalogPageLayout toolbar={toolbar}>
      <CatalogSplitLayout
        className="lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-3.25rem-1rem)] lg:overflow-hidden"
        left={
          <CatalogLeftPane
            stickySplit={false}
            stickyToolbarRows={1}
            className="h-full"
            headerSlot={
              <DoctorCatalogListSortHeader
                summaryLine={
                  displayList.length === 0 ? "Нет шаблонов" : `Шаблонов: ${displayList.length}`
                }
                titleSort={titleSortForHeader}
                onTitleSortChange={(next) => setTitleSort(next === null ? "default" : next)}
              />
            }
          >
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
