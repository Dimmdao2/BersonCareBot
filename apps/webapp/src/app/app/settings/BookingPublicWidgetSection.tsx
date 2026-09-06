'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { apiJson } from '@/shared/lib/apiJson';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { buildPublicBookingWidgetOutputs } from '@/shared/publicBook/adminWidgetUrls';

const OVERVIEW = '/api/admin/booking-engine/overview';

function originFromWindow(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

type PublicWidgetOverview = {
  publicSlug: string | null;
};

export function BookingPublicWidgetSection() {
  const origin = originFromWindow();
  const [publicWidget, setPublicWidget] = useState<PublicWidgetOverview | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const json = await apiJson<{
          ok?: boolean;
          publicWidget?: PublicWidgetOverview;
        }>(OVERVIEW);
        setPublicWidget(json.publicWidget ?? null);
      } catch {
        setPublicWidget(null);
      }
    });
  }, []);

  const publicSlug = publicWidget?.publicSlug ?? null;
  const outputs = useMemo(
    () =>
      origin && publicSlug
        ? buildPublicBookingWidgetOutputs(origin, {
            orgSlug: publicSlug,
          })
        : null,
    [origin, publicSlug],
  );

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Код скопирован в буфер обмена');
    } catch {
      toast.error('Не удалось скопировать код');
    }
  }

  const variants = [
    { label: 'Виджет', text: outputs?.popupSnippet ?? null },
    { label: 'Страница', text: outputs?.pageUrl ?? null },
    { label: 'Код встраивания', text: outputs?.iframeSnippet ?? null },
  ];

  return (
    <div className="flex flex-col gap-3">
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Предпросмотр</DoctorSectionTitle>
        </DoctorSectionHeader>
        {outputs ? (
          <iframe
            src={outputs.previewUrl}
            title="Предпросмотр записи"
            className="h-[min(720px,70vh)] w-full rounded-md border bg-background"
            loading="lazy"
          />
        ) : pending ? null : (
          <p className="text-sm text-muted-foreground">Публичная форма пока недоступна.</p>
        )}
      </DoctorSection>

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Публичная форма записи</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="divide-y divide-border/60">
          {variants.map((variant) => (
            <div key={variant.label} className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-base">{variant.label}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Копировать: ${variant.label}`}
                title="Копировать"
                disabled={!variant.text}
                onClick={() => {
                  if (variant.text) void copyText(variant.text);
                }}
              >
                <Copy className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      </DoctorSection>
    </div>
  );
}
