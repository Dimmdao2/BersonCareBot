import { publicBookPaths } from './paths';

export type PublicBookingWidgetSelection = {
  orgSlug: string;
  surface?: 'booking' | 'leads';
  branchId?: string;
  serviceId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

function selectionQuery(selection: PublicBookingWidgetSelection): URLSearchParams {
  const query = new URLSearchParams();
  if (selection.branchId?.trim()) query.set('branch', selection.branchId.trim());
  if (selection.utmSource?.trim()) query.set('utm_source', selection.utmSource.trim());
  if (selection.utmMedium?.trim()) query.set('utm_medium', selection.utmMedium.trim());
  if (selection.utmCampaign?.trim()) query.set('utm_campaign', selection.utmCampaign.trim());
  return query;
}

/** One canonical URL for every admin-generated public booking output. */
export function buildPublicBookingWidgetUrl(
  origin: string,
  selection: PublicBookingWidgetSelection,
): string {
  const query = selectionQuery(selection).toString();
  const pageUrl = `${origin}${
    selection.surface === 'leads'
      ? publicBookPaths.leadsForSlug(selection.orgSlug)
      : publicBookPaths.forSlug(selection.orgSlug)
  }`;
  return `${pageUrl}${query ? `?${query}` : ''}`;
}

export function buildPublicBookingWidgetOutputs(
  origin: string,
  selection: PublicBookingWidgetSelection,
): {
  pageUrl: string;
  previewUrl: string;
  iframeSnippet: string;
  scriptSnippet: string;
  popupSnippet: string;
} {
  const pageUrl = buildPublicBookingWidgetUrl(origin, selection);
  const previewUrl = `${pageUrl}${pageUrl.includes('?') ? '&' : '?'}embed=iframe`;
  const embedSeparator = pageUrl.includes('?') ? '&amp;' : '?';
  const scriptSrc = `${origin}${publicBookPaths.embedScript}`;
  const escapedUrl = pageUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const isLeads = selection.surface === 'leads';
  const title = isLeads ? 'Заявка' : 'Запись';
  const intakeAttribute = isLeads ? ' data-intake="leads"' : '';
  return {
    pageUrl,
    previewUrl,
    iframeSnippet: `<iframe src="${escapedUrl}${embedSeparator}embed=iframe" title="${title}" style="border:0;width:100%;min-height:720px" loading="lazy"></iframe>`,
    scriptSnippet: `<script src="${scriptSrc}" data-booking-url="${escapedUrl}"${intakeAttribute} data-mode="iframe" async></script>`,
    popupSnippet: `<script src="${scriptSrc}" data-booking-url="${escapedUrl}"${intakeAttribute} data-mode="popup" async></script>`,
  };
}
