/**
 * Корневая страница «/»: маркетинговая обложка и установка PWA (без редиректа в `/app`).
 */

import type { Metadata } from "next";
import { MarketingHomeLanding } from "@/shared/ui/marketing/MarketingHomeLanding";
import { PwaInstallSection } from "@/shared/ui/marketing/PwaInstallSection";

export const metadata: Metadata = {
  title: "BersonCare — приложение реабилитолога",
  description:
    "Разминки, видео, материалы и программа реабилитации. Установите приложение на телефон для быстрого доступа.",
};

export default async function HomePage() {
  return <MarketingHomeLanding installSlot={<PwaInstallSection />} />;
}
