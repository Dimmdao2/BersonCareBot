import { InfoBlock } from "@/shared/ui/InfoBlock";
import { MarkdownContent } from "@/shared/ui/markdown/MarkdownContent";
import type { PatientHomeBanner } from "@/modules/patient-home/repository";
import type { HomeNews } from "@/modules/patient-home/newsMotivation";

type Props = {
  /** Управляемая новость из БД (приоритет). */
  news?: HomeNews | null;
  /** Fallback: тема рассылки как баннер. */
  banner?: PatientHomeBanner | null;
};

export function PatientHomeNewsSection({ news, banner }: Props) {
  if (news) {
    return (
      <section id="patient-home-news-section" className="stack gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Новости</h2>
        <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-2 text-base font-semibold">{news.title}</h3>
          <MarkdownContent text={news.bodyMd} bodyFormat="markdown" />
        </article>
      </section>
    );
  }
  if (banner) {
    return (
      <section id="patient-home-news-section" className="stack gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Новости</h2>
        <InfoBlock variant={banner.variant === "important" ? "important" : "info"}>{banner.title}</InfoBlock>
      </section>
    );
  }
  return null;
}
