"use client";

import DOMPurify from "isomorphic-dompurify";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routePaths } from "@/app-layer/routes/paths";
import type { BookingBranchService } from "@/modules/booking-catalog/types";
import { MarkdownContent } from "@/shared/ui/markdown/MarkdownContent";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { bookingChoiceRowClass, bookingChoiceSectionClass } from "../bookingChoiceStyles";

function looksLikeHtmlMarkup(s: string): boolean {
  return /<[a-z][\s\S]*>/i.test(s.trim());
}

/** Описание услуги под названием: HTML из каталога (санитизация) или Markdown (списки, абзацы). */
function BookingServiceDescription({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const inheritedDescWrap = cn(
    "mt-1 w-full min-w-0 font-normal text-sm leading-snug text-[var(--patient-text-secondary,#475569)] transition-colors",
    /* при hover/active/focus строки: заголовок белый, описание — светло-серое (#eee) */
    "group-hover:text-[#eee] group-active:text-[#eee] group-focus-visible:text-[#eee]",
    "group-hover:[&_.markdown-preview]:!text-[#eee] group-focus-visible:[&_.markdown-preview]:!text-[#eee] group-active:[&_.markdown-preview]:!text-[#eee]",
    "group-hover:[&_*]:!text-[#eee] group-focus-visible:[&_*]:!text-[#eee] group-active:[&_*]:!text-[#eee]",
    "[&_a]:underline",
  );

  const richContentClass = cn(
    "[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
  );

  if (looksLikeHtmlMarkup(trimmed)) {
    const safe = DOMPurify.sanitize(trimmed, { USE_PROFILES: { html: true } });
    return (
      <div
        className={cn(inheritedDescWrap, richContentClass, "[&_*]:text-current")}
        // eslint-disable-next-line react/no-danger -- DOMPurify как в MarkdownContent (legacy-html)
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    );
  }

  return (
    <div className={inheritedDescWrap}>
      <MarkdownContent
        text={trimmed}
        bodyFormat="markdown"
        className={cn(
          "markdown-preview !m-0 border-0 bg-transparent !p-0 !text-current shadow-none [&_*]:!text-current",
          richContentClass,
        )}
      />
    </div>
  );
}

export type ServiceStepClientProps = {
  cityCode: string;
  cityTitle: string;
  services: BookingBranchService[];
  catalogError: string | null;
};

export function ServiceStepClient({ cityCode, cityTitle, services, catalogError }: ServiceStepClientProps) {
  const router = useRouter();

  return (
    <div className={bookingChoiceSectionClass}>
      {catalogError ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-destructive">{catalogError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
            Повторить
          </Button>
        </div>
      ) : null}

      {!catalogError ? (
        <div className="flex flex-col gap-2">
          {services.map((s) => {
            const title = s.service?.title ?? "Услуга";
            const dur = s.service?.durationMinutes;
            const label = dur != null ? `${title} (${dur} мин.)` : title;
            const desc = s.service?.description?.trim();
            return (
              <button
                key={s.id}
                type="button"
                className={cn(
                  bookingChoiceRowClass,
                  /* строка — font-medium из bookingChoiceRowClass; описание — обычная жирность */
                  "min-h-0 flex-col items-stretch justify-start gap-1 py-3 text-left font-normal",
                )}
                onClick={() =>
                  router.push(
                    `${routePaths.bookingNewSlot}?type=in_person` +
                      `&cityCode=${encodeURIComponent(cityCode)}` +
                      `&cityTitle=${encodeURIComponent(cityTitle)}` +
                      `&branchServiceId=${encodeURIComponent(s.id)}` +
                      `&serviceTitle=${encodeURIComponent(title)}`,
                  )
                }
              >
                <span className="font-medium">{label}</span>
                {desc ? <BookingServiceDescription text={desc} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {!catalogError && services.length === 0 ? (
        <p className={patientMutedTextClass}>Нет доступных услуг в этом городе.</p>
      ) : null}
    </div>
  );
}
