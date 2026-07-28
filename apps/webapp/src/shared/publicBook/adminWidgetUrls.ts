import { publicBookPaths } from './paths';

export type PublicBookingWidgetSelection = {
  orgSlug: string;
  branchId: string;
  serviceId: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

function selectionQuery(selection: PublicBookingWidgetSelection): URLSearchParams {
  const query = new URLSearchParams({
    orgSlug: selection.orgSlug,
    branchId: selection.branchId,
    serviceId: selection.serviceId,
  });
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
  return `${origin}${publicBookPaths.root}?${query}`;
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
  const previewUrl = `${pageUrl}&embed=iframe`;
  const scriptSrc = `${origin}${publicBookPaths.embedScript}`;
  const escapedUrl = pageUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return {
    pageUrl,
    previewUrl,
    iframeSnippet: `<iframe src="${escapedUrl}&amp;embed=iframe" title="Запись" style="border:0;width:100%;min-height:720px" loading="lazy"></iframe>`,
    scriptSnippet: `<script src="${scriptSrc}" data-booking-url="${escapedUrl}" data-mode="iframe" async></script>`,
    popupSnippet: `<script src="${scriptSrc}" data-booking-url="${escapedUrl}" data-mode="popup" async></script>`,
  };
}
