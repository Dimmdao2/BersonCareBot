"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { publicBookPaths } from "@/shared/publicBook/paths";

function originFromWindow(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export function BookingPublicWidgetSection() {
  const origin = originFromWindow();
  const [city, setCity] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [branchServiceId, setBranchServiceId] = useState("");

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (city.trim()) p.set("city", city.trim());
    if (utmSource.trim()) p.set("utm_source", utmSource.trim());
    if (utmMedium.trim()) p.set("utm_medium", utmMedium.trim());
    if (utmCampaign.trim()) p.set("utm_campaign", utmCampaign.trim());
    if (branchServiceId.trim()) p.set("branchServiceId", branchServiceId.trim());
    return p.toString();
  }, [city, utmSource, utmMedium, utmCampaign, branchServiceId]);

  const pageUrl = `${origin}${publicBookPaths.new}${query ? `?${query}` : ""}`;
  const scriptSrc = `${origin}${publicBookPaths.embedScript}`;

  const iframeSnippet = useMemo(
    () =>
      `<iframe src="${pageUrl}${pageUrl.includes("?") ? "&" : "?"}embed=iframe" title="Запись" style="border:0;width:100%;min-height:720px" loading="lazy"></iframe>`,
    [pageUrl],
  );

  const scriptSnippet = useMemo(
    () =>
      `<script src="${scriptSrc}" data-base="${origin}" data-mode="iframe"${city.trim() ? ` data-city="${city.trim()}"` : ""}${utmSource.trim() ? ` data-utm-source="${utmSource.trim()}"` : ""} async></script>`,
    [scriptSrc, origin, city, utmSource],
  );

  const popupSnippet = useMemo(
    () =>
      `<script src="${scriptSrc}" data-base="${origin}" data-mode="popup" async></script>`,
    [scriptSrc, origin],
  );

  return (
    <section className="rounded-lg border p-4">
      <h2 className="text-base font-semibold">Публичная запись (виджет)</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Input placeholder="Город (code)" value={city} onChange={(e) => setCity(e.target.value)} />
        <Input
          placeholder="branchServiceId (uuid)"
          value={branchServiceId}
          onChange={(e) => setBranchServiceId(e.target.value)}
        />
        <Input placeholder="utm_source" value={utmSource} onChange={(e) => setUtmSource(e.target.value)} />
        <Input placeholder="utm_medium" value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} />
        <Input
          placeholder="utm_campaign"
          value={utmCampaign}
          onChange={(e) => setUtmCampaign(e.target.value)}
          className="sm:col-span-2"
        />
      </div>
      <div className="mt-4 space-y-4 text-sm">
        <div>
          <p className="font-medium">Ссылка</p>
          <code className="mt-1 block break-all rounded bg-muted p-2">{pageUrl}</code>
        </div>
        <div>
          <p className="font-medium">iframe</p>
          <code className="mt-1 block whitespace-pre-wrap break-all rounded bg-muted p-2">{iframeSnippet}</code>
        </div>
        <div>
          <p className="font-medium">JS (iframe)</p>
          <code className="mt-1 block whitespace-pre-wrap break-all rounded bg-muted p-2">{scriptSnippet}</code>
        </div>
        <div>
          <p className="font-medium">JS (popup)</p>
          <code className="mt-1 block whitespace-pre-wrap break-all rounded bg-muted p-2">{popupSnippet}</code>
        </div>
      </div>
    </section>
  );
}
