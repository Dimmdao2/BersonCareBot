"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  TreatmentProgramTemplate,
  TreatmentProgramTemplateDetail,
  TreatmentProgramTemplateListPreviewMedia,
} from "@/modules/treatment-program/types";
import { cn } from "@/lib/utils";
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
import { useDoctorCatalogClientFilterMerge } from "@/shared/hooks/useDoctorCatalogClientFilterMerge";
import { useDoctorCatalogMasterSelectionSync } from "@/shared/hooks/useDoctorCatalogMasterSelectionSync";
import type { CatalogMasterTitleSort } from "@/shared/ui/doctor/DoctorCatalogMasterListHeader";
import { DoctorCatalogFiltersForm } from "@/shared/ui/doctor/DoctorCatalogFiltersForm";
import { DoctorCatalogListSortHeader } from "@/shared/ui/doctor/DoctorCatalogListSortHeader";
import {
  doctorCatalogToolbarPrimaryActionClassName,
  DoctorCatalogFiltersToolbar,
  DoctorCatalogToolbarFiltersSlot,
} from "@/shared/ui/doctor/DoctorCatalogFiltersToolbar";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import { DoctorCatalogMasterListRow } from "@/shared/ui/doctor/DoctorCatalogMasterListRow";
import {
  TreatmentProgramConstructorClient,
  type TreatmentProgramLibraryPickers,
} from "./[id]/TreatmentProgramConstructorClient";
import { NewTemplateForm } from "./new/NewTemplateForm";
import type { DoctorCatalogPubArchQuery } from "@/shared/lib/doctorCatalogListStatus";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { clinicalTestMediaItemToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import { DoctorCatalogInvalidPubArchToast } from "@/shared/ui/doctor/DoctorCatalogInvalidPubArchToast";
import { TREATMENT_PROGRAM_TEMPLATES_PATH } from "./paths";
import { TreatmentProgramTemplateStatusBadge } from "./TreatmentProgramTemplateStatusBadge";

/** Краткая строка счётчиков + подпись для aria (список шаблонов). */
function templateListCountsText(stageCount: number, itemCount: number): { line: string; ariaLabel: string } {
  const ru = (n: number, one: string, few: string, many: string) => {
    const m = n % 100;
    const t = n % 10;
    if (t === 1 && m !== 11) return `${n} ${one}`;
    if (t >= 2 && t <= 4 && (m < 12 || m > 14)) return `${n} ${few}`;
    return `${n} ${many}`;
  };
  const line = `${ru(stageCount, "этап", "этапа", "этапов")} · ${ru(itemCount, "элемент", "элемента", "элементов")}`;
  return { line, ariaLabel: `В шаблоне: ${line}` };
}

function TreatmentProgramTemplateRowPreviewMedia({
  preview,
  active,
  size = "md",
}: {
  preview: TreatmentProgramTemplateListPreviewMedia | null;
  active: boolean;
  /** `sm` — 30px как в списке комплексов ЛФК; `md` — 40px (прежний список шаблонов). */
  size?: "sm" | "md";
}): ReactNode {
  const box = size === "sm" ? "size-[30px]" : "size-10";
  const shellClass = cn(
    size === "md" && "mt-0.5",
    "flex shrink-0 overflow-hidden rounded-md border bg-muted/50",
    box,
    active && "border-primary/20 bg-primary/10",
  );
  const iconClass = size === "sm" ? "size-4" : "size-5";
  const videoSizes = size === "sm" ? "30px" : "40px";
  if (!preview?.mediaUrl) {
    return (
      <div className={shellClass} aria-hidden>
        <div className="flex size-full items-center justify-center">
          <ClipboardList className={cn(iconClass, active ? "text-primary" : "text-muted-foreground")} />
        </div>
      </div>
    );
  }
  if (preview.mediaType === "video") {
    return (
      <div className={shellClass} aria-hidden>
        <video
          src={preview.mediaUrl}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className={shellClass} aria-hidden>
      <MediaThumb
        media={clinicalTestMediaItemToPreviewUi({
          mediaUrl: preview.mediaUrl,
          mediaType: preview.mediaType,
          sortOrder: 0,
        })}
        className="size-full"
        imgClassName="size-full object-cover"
        sizes={videoSizes}
      />
    </div>
  );
}

type Props = {
  templates: TreatmentProgramTemplate[];
  library: TreatmentProgramLibraryPickers;
  initialSelectedId: string | null;
  filters: {
    q: string;
    listPubArch: DoctorCatalogPubArchQuery;
  };
  initialTitleSort: "asc" | "desc" | null;
};

export function TreatmentProgramTemplatesPageClient({
  templates,
  library,
  initialSelectedId,
  filters,
  initialTitleSort,
}: Props) {
  const router = useRouter();
  const formKey = useId();
  const [titleSort, setTitleSort] = useState<CatalogMasterTitleSort | null>(initialTitleSort);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<TreatmentProgramTemplate | null>(null);
  const [detail, setDetail] = useState<TreatmentProgramTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailFetchGenRef = useRef(0);
  const [isListPending, startListTransition] = useTransition();

  const filterScope = useMemo(() => ({ ...filters, titleSort }), [filters, titleSort]);
  const mergedFilters = useDoctorCatalogClientFilterMerge(filterScope);

  useEffect(() => {
    setTitleSort(initialTitleSort);
  }, [initialTitleSort]);

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

  const displayList = useDoctorCatalogDisplayList(
    templates,
    mergedFilters.q,
    mergedFilters.titleSort === null ? "default" : mergedFilters.titleSort,
  );

  useDoctorCatalogMasterSelectionSync({
    displayList,
    setSelectedId,
    setMobileItem: setMobileSheet,
    fallbackToFirst: false,
  });

  const selected = displayList.find((t) => t.id === selectedId) ?? null;

  const titleSortForHeader: CatalogMasterTitleSort | null =
    mergedFilters.titleSort === "asc" || mergedFilters.titleSort === "desc" ? mergedFilters.titleSort : null;

  const changeTitleSort = (next: CatalogMasterTitleSort | null) => {
    startListTransition(() => {
      setTitleSort(next);
    });
  };

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
          const counts = templateListCountsText(t.stageCount, t.itemCount);
          return (
            <DoctorCatalogMasterListRow
              key={t.id}
              active={active}
              onPick={() => onPick(t)}
              previewInner={
                <TreatmentProgramTemplateRowPreviewMedia
                  preview={t.listPreviewMedia}
                  active={active}
                  size="sm"
                />
              }
              title={t.title}
              meta={
                <span aria-label={counts.ariaLabel} className={cn(active && "text-primary/80")}>
                  {counts.line}
                </span>
              }
              badge={
                <TreatmentProgramTemplateStatusBadge
                  status={t.status}
                  className="w-full justify-center text-[10px] leading-tight"
                />
              }
            />
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
      <TreatmentProgramConstructorClient
        templateId={selected.id}
        initialDetail={detail}
        library={library}
        onArchived={() => {
          router.refresh();
          setSelectedId(null);
          setMobileSheet(null);
          setDetail(null);
        }}
      />
    ) : (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">Новый шаблон программы</p>
        <p className="text-sm text-muted-foreground">Задайте название и откройте конструктор этапов.</p>
        <NewTemplateForm showCancelLink={false} titleInputId="tpl-title-catalog-inline" />
      </div>
    );

  const desktopRight = <CatalogRightPane className="h-full">{rightInner}</CatalogRightPane>;

  const mobileDetailOpen = mobileSheet != null;

  const toolbar = (
    <DoctorCatalogFiltersToolbar
      filters={
        <DoctorCatalogToolbarFiltersSlot>
          <DoctorCatalogFiltersForm
            idPrefix={`${formKey}-tpt`}
            q={mergedFilters.q}
            showRegionFilter={false}
            showLoadFilter={false}
            titleSort={mergedFilters.titleSort}
            selectedId={selectedId}
            catalogPubArch={mergedFilters.listPubArch}
          />
        </DoctorCatalogToolbarFiltersSlot>
      }
      end={
        <Link href={`${TREATMENT_PROGRAM_TEMPLATES_PATH}/new`} className={doctorCatalogToolbarPrimaryActionClassName}>
          Создать
        </Link>
      }
    />
  );

  return (
    <>
      <DoctorCatalogInvalidPubArchToast />
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
                onTitleSortChange={changeTitleSort}
                catalogPubArch={mergedFilters.listPubArch}
                archiveScopeExtraParams={{
                  titleSort: mergedFilters.titleSort,
                }}
              />
            }
          >
            <div
              className={cn(
                "min-h-0 flex-1 overflow-hidden transition-opacity",
                isListPending && "opacity-80",
              )}
              aria-busy={isListPending}
            >
              {renderRows((t) => {
                setSelectedId(t.id);
                setMobileSheet(t);
              }, selected?.id ?? mobileSheet?.id ?? null)}
            </div>
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
    </>
  );
}
