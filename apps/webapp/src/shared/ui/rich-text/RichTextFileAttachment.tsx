import { FileText } from 'lucide-react';

export function RichTextFileAttachment({
  href,
  title,
  download = false,
}: {
  href: string;
  title: string;
  download?: boolean;
}) {
  return (
    <a
      href={href}
      download={download || undefined}
      target={download ? undefined : '_blank'}
      rel={download ? undefined : 'noopener noreferrer nofollow'}
      className="my-3 flex w-full max-w-lg items-center gap-2.5 rounded-[7px] border border-border bg-background px-3 py-2.5 text-foreground no-underline"
    >
      <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate underline underline-offset-2">{title}</span>
    </a>
  );
}
