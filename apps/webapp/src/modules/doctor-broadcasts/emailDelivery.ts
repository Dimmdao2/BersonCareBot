import { escapeHtml } from '@/shared/lib/escapeHtml';

/** Resolve only confirmed primary email contacts for the requested platform users. */
export type BroadcastEmailRecipientsPort = {
  getVerifiedEmailsForUserIds(userIds: string[]): Promise<Map<string, string>>;
};

/** HTML body stored in the queued email intent, including the recipient-specific unsubscribe CTA. */
export function buildBroadcastEmailHtml(input: {
  title: string;
  body: string;
  unsubscribeUrl: string;
  unsubscribeTopicTitle: string;
  mediaUrl?: string | null;
}): string {
  const img = input.mediaUrl
    ? `<img src="${escapeHtml(input.mediaUrl)}" alt="" style="max-width:100%;height:auto;border-radius:8px;display:block;margin-bottom:12px" />`
    : '';
  const head = input.title.trim()
    ? `<div style="font-weight:600;font-size:16px;margin-bottom:6px">${escapeHtml(input.title.trim())}</div>`
    : '';
  const text = `<div style="white-space:pre-wrap">${escapeHtml(input.body)}</div>`;
  const unsubscribeUrl = escapeHtml(input.unsubscribeUrl);
  const unsubscribeTopicTitle = escapeHtml(input.unsubscribeTopicTitle);
  const unsubscribe = `<div style="margin-top:20px"><a href="${unsubscribeUrl}" style="display:inline-block;padding:8px 14px;border:1px solid #d8d8d8;border-radius:18px;color:#555;text-decoration:none">Отписаться от «${unsubscribeTopicTitle}»</a></div>`;
  return `${img}${head}${text}${unsubscribe}`;
}
