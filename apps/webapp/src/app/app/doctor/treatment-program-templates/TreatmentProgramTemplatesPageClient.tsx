"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TreatmentProgramTemplate, TreatmentProgramTemplateDetail } from "@/modules/treatment-program/types";
import { cn } from "@/lib/utils";
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
import { useDoctorCatalogMasterSelectionSync } from "@/shared/hooks/useDoctorCatalogMasterSelectionSync";
import { DoctorCatalogStickyToolbar } from "@/shared/ui/doctor/DoctorCatalogStickyToolbar";
import { DoctorCatalogTitleSortSelect, type TitleSortValue } from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";
import { DoctorCatalogToolbarMainRow } from "@/shared/ui/doctor/DoctorCatalogToolbarLayout";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";
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
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">Новый шаблон программы</p>
        <p className="text-sm text-muted-foreground">Задайте название и откройте конструктор этапов.</p>
        <NewTemplateForm showCancelLink={false} titleInputId="tpl-title-catalog-inline" />
      </div>
    );

  const desktopRight = (
    <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">{rightInner}</CardContent>
    </Card>
  );

  const mobileDetailOpen = mobileSheet != null;

  const toolbar = (
    <DoctorCatalogStickyToolbar>
      <DoctorCatalogToolbarMainRow
        start={
          <>
            <PickerSearchField
              id={searchFieldId}
              label="Поиск по названию"
              placeholder="Название шаблона"
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="min-w-0 sm:max-w-[14rem] sm:flex-initial"
            />
            <DoctorCatalogTitleSortSelect value={titleSort} onValueChange={setTitleSort} />
          </>
        }
        end={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <p className="min-w-0 shrink-0 truncate text-xs text-muted-foreground">
              {displayList.length === 0 ? "Нет шаблонов" : `Шаблонов: ${displayList.length}`}
            </p>
            <Link href={`${TREATMENT_PROGRAM_TEMPLATES_PATH}/new`} className={cn(buttonVariants({ size: "sm" }), "shrink-0 text-center")}>
              Новый шаблон
            </Link>
          </div>
        }
      />
    </DoctorCatalogStickyToolbar>
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
