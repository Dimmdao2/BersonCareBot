"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { BOOKING_FORM_MAX_WIDTH_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

const OVERVIEW = "/api/admin/booking-engine/overview";

function originFromWindow(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

type ServiceRow = { id: string; title: string; publicWidgetVisible: boolean; isActive: boolean };

export function BookingPublicWidgetSection() {
  const origin = originFromWindow();
  const [city, setCity] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [branchServiceId, setBranchServiceId] = useState("");
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await fetch(OVERVIEW);
      const json = (await res.json()) as { ok?: boolean; services?: ServiceRow[] };
      if (json.ok && json.services) {
        setServices(json.services.filter((s) => s.isActive && s.publicWidgetVisible));
      }
    });
  }, []);

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
  const previewUrl = `${pageUrl}${pageUrl.includes("?") ? "&" : "?"}embed=iframe`;
  const scriptSrc = `${origin}${publicBookPaths.embedScript}`;

  const serviceLabel = services.find((s) => s.id === branchServiceId)?.title;

  const iframeSnippet = useMemo(
    () =>
      `<iframe src="${previewUrl}" title="Запись" style="border:0;width:100%;min-height:720px" loading="lazy"></iframe>`,
    [previewUrl],
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

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="text-base font-semibold">Публичная запись (виджет)</h2>
      <div className={`mt-3 grid gap-2 sm:grid-cols-2 ${BOOKING_FORM_MAX_WIDTH_CLASS}`}>
        <Input placeholder="Город (code)" value={city} onChange={(e) => setCity(e.target.value)} />
        <div className="space-y-2">
          <Label className="sr-only">Услуга</Label>
          <Select
            value={branchServiceId || "__none__"}
            onValueChange={(v) => setBranchServiceId(!v || v === "__none__" ? "" : v)}
          >
            <SelectTrigger displayLabel={serviceLabel ?? "—"} className="w-full" />
            <SelectContent>
              <SelectItem value="__none__" label="—">
                —
              </SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id} label={s.title}>
                  {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input placeholder="utm_source" value={utmSource} onChange={(e) => setUtmSource(e.target.value)} />
        <Input placeholder="utm_medium" value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} />
        <Input
          placeholder="utm_campaign"
          value={utmCampaign}
          onChange={(e) => setUtmCampaign(e.target.value)}
          className="sm:col-span-2"
        />
      </div>

      {origin ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Открыть страницу
          </Link>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "Скрыть предпросмотр" : "Предпросмотр"}
          </Button>
        </div>
      ) : null}

      {showPreview && origin ? (
        <iframe
          src={previewUrl}
          title="Предпросмотр записи"
          className="mt-4 h-[min(720px,70vh)] w-full rounded-md border bg-background"
          loading="lazy"
        />
      ) : null}

      <div className="mt-4 space-y-4 text-sm">
        {[
          { label: "Ссылка", text: pageUrl },
          { label: "iframe", text: iframeSnippet },
          { label: "JS (iframe)", text: scriptSnippet },
          { label: "JS (popup)", text: popupSnippet },
        ].map((block) => (
          <div key={block.label} className="sm:col-span-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-medium">{block.label}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyText(block.text)}>
                Копировать
              </Button>
            </div>
            <code className="block max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
              {block.text}
            </code>
          </div>
        ))}
      </div>
    </section>
  );
}
