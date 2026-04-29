"use client";

import Link from "next/link";
import { useMemo } from "react";
import type {
  PatientHomeBlockCode,
  PatientHomeBlockItemTargetType,
  PatientHomeCmsBlockCode,
} from "@/modules/patient-home/blocks";
import { isPatientHomeCmsBlockCode, patientHomeCmsBlockAllowsContentSection } from "@/modules/patient-home/blocks";
import { getPatientHomeBlockEditorMetadata } from "@/modules/patient-home/blockEditorMetadata";
import type { PatientHomeEditorCandidateRow, PatientHomeEditorItemRow } from "@/modules/patient-home/patientHomeEditorDemo";
import {
  buildPatientHomeContentNewUrl,
  buildPatientHomeCourseNewUrl,
  buildPatientHomeSectionsNewUrl,
  PATIENT_HOME_CMS_DEFAULT_RETURN_PATH,
} from "@/modules/patient-home/patientHomeCmsReturnUrls";
import { PatientHomeCreateSectionInlineForm } from "@/app/app/settings/patient-home/PatientHomeCreateSectionInlineForm";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const GROUP_ORDER: PatientHomeBlockItemTargetType[] = ["content_section", "content_page", "course"];

const GROUP_HEADINGS: Record<PatientHomeBlockItemTargetType, string> = {
  content_section: "Разделы",
  content_page: "Материалы",
  course: "Курсы",
};

export type PatientHomeBlockCandidatePickerProps = {
  blockCode: PatientHomeBlockCode;
  candidates: PatientHomeEditorCandidateRow[];
  search: string;
  onSearchChange: (q: string) => void;
  onPick: (candidate: PatientHomeEditorCandidateRow) => void;
  /** Phase 3: после успешного inline-create — добавить элемент в блок без закрытия редактора. */
  onInlineSectionCreated?: (item: PatientHomeEditorItemRow) => void;
};

function filterCandidates(rows: PatientHomeEditorCandidateRow[], q: string): PatientHomeEditorCandidateRow[] {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  return rows.filter(
    (r) =>
      r.title.toLowerCase().includes(s) ||
      r.targetRef.toLowerCase().includes(s) ||
      r.targetType.toLowerCase().includes(s) ||
      (r.statusLabel && r.statusLabel.toLowerCase().includes(s)),
  );
}

function showCreateCtaForGroup(blockCode: PatientHomeCmsBlockCode, type: PatientHomeBlockItemTargetType): boolean {
  if (blockCode === "subscription_carousel") return true;
  if (blockCode === "daily_warmup" && type === "content_page") return true;
  if (blockCode === "sos" && (type === "content_page" || type === "content_section")) return true;
  if (blockCode === "courses" && type === "course") return true;
  return false;
}

function alwaysShowGroupHeading(blockCode: PatientHomeCmsBlockCode): boolean {
  return blockCode === "subscription_carousel";
}

export function PatientHomeBlockCandidatePicker({
  blockCode,
  candidates,
  search,
  onSearchChange,
  onPick,
  onInlineSectionCreated,
}: PatientHomeBlockCandidatePickerProps) {
  const meta = getPatientHomeBlockEditorMetadata(blockCode);
  const filtered = useMemo(() => filterCandidates(candidates, search), [candidates, search]);
  const grouped = useMemo(() => {
    const m = new Map<PatientHomeBlockItemTargetType, PatientHomeEditorCandidateRow[]>();
    for (const t of GROUP_ORDER) m.set(t, []);
    for (const c of filtered) {
      m.get(c.targetType)?.push(c);
    }
    return m;
  }, [filtered]);

  const cmsBlock = isPatientHomeCmsBlockCode(blockCode) ? blockCode : null;

  const showCreateSection =
    cmsBlock === "situations" && filtered.length === 0;

  const returnBase = PATIENT_HOME_CMS_DEFAULT_RETURN_PATH;

  return (
    <div className="space-y-3" data-testid="patient-home-candidate-picker">
      <div>
        <label htmlFor="ph-candidate-search" className="mb-1 block text-xs font-medium text-muted-foreground">
          Поиск кандидатов
        </label>
        <Input
          id="ph-candidate-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Название, slug, тип или статус…"
          autoComplete="off"
        />
      </div>
      <p className="text-xs text-muted-foreground">Контекст: {meta.addLabel}</p>

      {showCreateSection ? (
        onInlineSectionCreated ? (
          <PatientHomeCreateSectionInlineForm
            blockCode="situations"
            onSuccess={(item) => {
              onInlineSectionCreated(item);
              onSearchChange("");
            }}
          />
        ) : (
          <div className="rounded-md border border-dashed border-border p-3 text-sm">
            <p className="mb-2 text-muted-foreground">Нет подходящих разделов в списке.</p>
            <Link
              href={
                cmsBlock
                  ? buildPatientHomeSectionsNewUrl({ returnTo: returnBase, patientHomeBlock: cmsBlock })
                  : "/app/doctor/content/sections/new"
              }
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "inline-flex")}
            >
              Создать раздел
            </Link>
          </div>
        )
      ) : null}

      <div className="max-h-52 space-y-4 overflow-y-auto pr-1">
        {cmsBlock
          ? GROUP_ORDER.map((type) => {
              const list = grouped.get(type) ?? [];
              const showCta = showCreateCtaForGroup(cmsBlock, type);
              const showHeading = list.length > 0 || alwaysShowGroupHeading(cmsBlock) || showCta;
              if (!showHeading) return null;
              return (
                <div key={type} data-testid={`ph-picker-group-${type}`}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {GROUP_HEADINGS[type]}
                  </p>
                  {showCta ? (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {type === "content_section" && patientHomeCmsBlockAllowsContentSection(cmsBlock) ? (
                        <Link
                          href={buildPatientHomeSectionsNewUrl({ returnTo: returnBase, patientHomeBlock: cmsBlock })}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex")}
                        >
                          Создать раздел
                        </Link>
                      ) : null}
                      {type === "content_page" ? (
                        <Link
                          href={buildPatientHomeContentNewUrl({ patientHomeBlock: cmsBlock })}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex")}
                        >
                          Создать материал в CMS
                        </Link>
                      ) : null}
                      {type === "course" ? (
                        <Link
                          href={buildPatientHomeCourseNewUrl({ patientHomeBlock: cmsBlock })}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex")}
                        >
                          Создать курс
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                  {list.length > 0 ? (
                    <ul className="space-y-1">
                      {list.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="w-full rounded-md border border-transparent px-2 py-1.5 text-left text-sm hover:border-border hover:bg-muted/60"
                            onClick={() => onPick(c)}
                          >
                            <span className="font-medium">{c.title}</span>
                            {c.statusLabel ? (
                              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                                {c.statusLabel}
                              </span>
                            ) : null}
                            <span className="ml-2 font-mono text-xs text-muted-foreground">{c.targetRef}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">Нет кандидатов в этой группе.</p>
                  )}
                </div>
              );
            })
          : null}
      </div>
    </div>
  );
}
