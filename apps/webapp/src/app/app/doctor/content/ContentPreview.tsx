'use client';

import { MarkdownContent } from '@/shared/ui/doctor/markdown/MarkdownContent';
import { parseHostedVideoLink } from '@/shared/lib/hostingEmbedUrls';
import { ContentHeroImage } from '@/shared/ui/doctor/media/ContentHeroImage';
import { NoContextMenuVideo } from '@/shared/ui/doctor/media/NoContextMenuVideo';
import { HostedVideoEmbed } from '@/shared/ui/doctor/media/HostedVideoEmbed';
import { doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

type Props = {
  title: string;
  summary: string;
  bodyMd: string;
  imageUrl: string;
  videoUrl: string;
};

export function ContentPreview({ title, summary, bodyMd, imageUrl, videoUrl }: Props) {
  const { patientSingularLabel } = useDoctorPatientTerms();
  const hostedVideo = videoUrl ? parseHostedVideoLink(videoUrl) : null;
  return (
    <section className="rounded-xl border border-border bg-muted/10 p-4">
      <h3 className={`m-0 ${doctorSectionTitleClass}`}>
        Предпросмотр для {patientSingularLabel.toLowerCase()}
      </h3>
      <article className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <h4 className="m-0 text-base font-semibold">{title.trim() || 'Заголовок страницы'}</h4>
        {summary.trim() ? (
          <p className="m-0 text-sm text-muted-foreground">{summary.trim()}</p>
        ) : null}
        {imageUrl.trim() ? (
          <ContentHeroImage
            imageUrl={imageUrl.trim()}
            hydrateFromAdminApi
            className="max-h-80 max-w-full rounded object-contain"
            imgClassName="max-h-80 max-w-full rounded object-contain"
          />
        ) : null}
        <MarkdownContent text={bodyMd} bodyFormat="markdown" />
        {videoUrl.trim() ? (
          hostedVideo ? (
            <HostedVideoEmbed url={hostedVideo.canonicalUrl} title={title || 'preview-video'} />
          ) : (
            <NoContextMenuVideo controls preload="metadata" className="max-w-full rounded-lg">
              <source src={videoUrl.trim()} />
            </NoContextMenuVideo>
          )
        ) : (
          <p className="m-0 text-sm text-muted-foreground">Видео не выбрано</p>
        )}
      </article>
    </section>
  );
}
