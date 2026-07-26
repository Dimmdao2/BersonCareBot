"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Button, buttonVariants } from "@/shared/ui/doctor/primitives/button";
import { cn } from "@/lib/utils";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { apiJson } from "@/shared/lib/apiJson";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/doctor/primitives/select";
import { buildPublicBookingWidgetOutputs } from "@/shared/publicBook/adminWidgetUrls";
import { BOOKING_FORM_MAX_WIDTH_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";

const OVERVIEW = "/api/admin/booking-engine/overview";

function originFromWindow(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

type BranchRow = { id: string; title: string; isActive: boolean; cityCode: string };
type ServiceRow = { id: string; title: string; publicWidgetVisible: boolean; isActive: boolean };
type SpecialistRow = { id: string; isActive: boolean };
type SpecialistServiceAvailabilityRow = {
  specialistId: string;
  branchId: string | null;
  serviceId: string;
  isActive: boolean;
};
type PublicWidgetOverview = {
  publicSlug: string | null;
  specialists: SpecialistRow[];
  specialistAvailability: SpecialistServiceAvailabilityRow[];
};

export function BookingPublicWidgetSection() {
  const origin = originFromWindow();
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [publicWidget, setPublicWidget] = useState<PublicWidgetOverview | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const json = await apiJson<{
          ok?: boolean;
          branches?: BranchRow[];
          services?: ServiceRow[];
          publicWidget?: PublicWidgetOverview;
        }>(OVERVIEW);
        if (json.branches && json.services) {
          const activeBranches = json.branches.filter((b) => b.isActive);
          const visibleServices = json.services.filter((s) => s.isActive && s.publicWidgetVisible);
          setBranches(activeBranches);
          setServices(visibleServices);
          if (activeBranches[0]) setBranchId((prev) => prev || activeBranches[0]!.id);
          if (visibleServices[0]) setServiceId((prev) => prev || visibleServices[0]!.id);
          setPublicWidget(json.publicWidget ?? null);
        }
      } catch {
        // overview load failure is non-critical; selects stay empty
      }
    });
  }, []);

  const publicSlug = publicWidget?.publicSlug ?? null;
  const publicSpecialists = publicWidget?.specialists ?? [];
  const publicAvailability = publicWidget?.specialistAvailability ?? [];
  const isBookableSelection = Boolean(
    publicSlug &&
      publicAvailability.some(
        (availability) =>
          availability.isActive &&
          availability.branchId === branchId &&
          availability.serviceId === serviceId &&
          publicSpecialists.some(
            (specialist) => specialist.isActive && specialist.id === availability.specialistId,
          ),
      ),
  );
  const outputs = useMemo(
    () =>
      origin && publicSlug && isBookableSelection
        ? buildPublicBookingWidgetOutputs(origin, {
            orgSlug: publicSlug,
            branchId,
            serviceId,
            utmSource,
            utmMedium,
            utmCampaign,
          })
        : null,
    [origin, publicSlug, isBookableSelection, branchId, serviceId, utmSource, utmMedium, utmCampaign],
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
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
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
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
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

      {outputs ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={outputs.pageUrl}
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

      {showPreview && outputs ? (
        <iframe
          src={outputs.previewUrl}
          title="Предпросмотр записи"
          className="mt-4 h-[min(720px,70vh)] w-full rounded-md border bg-background"
          loading="lazy"
        />
      ) : null}

      {outputs ? (
        <div className="mt-4 space-y-4 text-sm">
          {[
            { label: "Ссылка", text: outputs.pageUrl },
            { label: "iframe", text: outputs.iframeSnippet },
            { label: "JS (iframe)", text: outputs.scriptSnippet },
            { label: "JS (popup)", text: outputs.popupSnippet },
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
