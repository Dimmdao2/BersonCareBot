"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Button, buttonVariants } from "@/shared/ui/doctor/primitives/button";
import { cn } from "@/lib/utils";
import { Label } from "@/shared/ui/doctor/primitives/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/ui/doctor/primitives/select";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { BOOKING_FORM_MAX_WIDTH_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";

const OVERVIEW = "/api/admin/booking-engine/overview";
const RESOLVE = "/api/admin/booking-engine/resolve-branch-service";

function originFromWindow(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

type BranchRow = { id: string; title: string; isActive: boolean; cityCode: string };
type ServiceRow = { id: string; title: string; publicWidgetVisible: boolean; isActive: boolean };

export function BookingPublicWidgetSection() {
  const origin = originFromWindow();
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [branchServiceId, setBranchServiceId] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await fetch(OVERVIEW);
      const json = (await res.json()) as {
        ok?: boolean;
        branches?: BranchRow[];
        services?: ServiceRow[];
      };
      if (json.ok && json.branches && json.services) {
        const activeBranches = json.branches.filter((b) => b.isActive);
        const visibleServices = json.services.filter((s) => s.isActive && s.publicWidgetVisible);
        setBranches(activeBranches);
        setServices(visibleServices);
        if (activeBranches[0]) setBranchId((prev) => prev || activeBranches[0]!.id);
        if (visibleServices[0]) setServiceId((prev) => prev || visibleServices[0]!.id);
      }
    });
  }, []);

  useEffect(() => {
    if (!branchId || !serviceId) {
      startTransition(() => {
        setBranchServiceId("");
        setCityCode("");
        setResolveError(null);
      });
      return;
    }
    startTransition(async () => {
      try {
        const qs = new URLSearchParams({ branchId, serviceId });
        const res = await fetch(`${RESOLVE}?${qs.toString()}`);
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          branchServiceId?: string;
          cityCode?: string;
        };
        if (!json.ok || !json.branchServiceId) {
          setBranchServiceId("");
          setCityCode("");
          setResolveError(json.error ?? "branch_service_mapping_missing");
          return;
        }
        setBranchServiceId(json.branchServiceId);
        setCityCode(json.cityCode ?? "");
        setResolveError(null);
      } catch {
        setBranchServiceId("");
        setCityCode("");
        setResolveError("resolve_failed");
      }
    });
  }, [branchId, serviceId]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (cityCode.trim()) p.set("city", cityCode.trim());
    if (utmSource.trim()) p.set("utm_source", utmSource.trim());
    if (utmMedium.trim()) p.set("utm_medium", utmMedium.trim());
    if (utmCampaign.trim()) p.set("utm_campaign", utmCampaign.trim());
    if (branchServiceId.trim()) p.set("branchServiceId", branchServiceId.trim());
    return p.toString();
  }, [cityCode, utmSource, utmMedium, utmCampaign, branchServiceId]);

  const pageUrl = `${origin}${publicBookPaths.new}${query ? `?${query}` : ""}`;
  const previewUrl = `${pageUrl}${pageUrl.includes("?") ? "&" : "?"}embed=iframe`;
  const scriptSrc = `${origin}${publicBookPaths.embedScript}`;

  const branchLabel = branches.find((b) => b.id === branchId)?.title;
  const serviceLabel = services.find((s) => s.id === serviceId)?.title;

  const iframeSnippet = useMemo(
    () =>
      `<iframe src="${previewUrl}" title="Запись" style="border:0;width:100%;min-height:720px" loading="lazy"></iframe>`,
    [previewUrl],
  );

  const scriptSnippet = useMemo(
    () =>
      `<script src="${scriptSrc}" data-base="${origin}" data-mode="iframe"${cityCode.trim() ? ` data-city="${cityCode.trim()}"` : ""}${utmSource.trim() ? ` data-utm-source="${utmSource.trim()}"` : ""} async></script>`,
    [scriptSrc, origin, cityCode, utmSource],
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
        <div className="space-y-2">
          <Label>Локация</Label>
          <Select value={branchId || "__none__"} onValueChange={(v) => setBranchId(!v || v === "__none__" ? "" : v)}>
            <SelectTrigger displayLabel={branchLabel ?? "—"} className="w-full" />
            <SelectContent>
              <SelectItem value="__none__" label="—">
                —
              </SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id} label={b.title}>
                  {b.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Услуга</Label>
          <Select
            value={serviceId || "__none__"}
            onValueChange={(v) => setServiceId(!v || v === "__none__" ? "" : v)}
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

      {resolveError ? (
        <p className="mt-3 text-sm text-destructive">
          Не удалось подготовить ссылку: настройте доступность и Rubitime-маппинг для выбранной пары локация ×
          услуга.
        </p>
      ) : null}

      {origin && branchServiceId ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Открыть страницу
          </Link>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "Скрыть предпросмотр" : "Предпросмотр"}
          </Button>
        </div>
      ) : null}

      {showPreview && origin && branchServiceId ? (
        <iframe
          src={previewUrl}
          title="Предпросмотр записи"
          className="mt-4 h-[min(720px,70vh)] w-full rounded-md border bg-background"
          loading="lazy"
        />
      ) : null}

      {branchServiceId ? (
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
      ) : null}
    </section>
  );
}
