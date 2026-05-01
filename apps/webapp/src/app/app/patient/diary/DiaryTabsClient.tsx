"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabKey = "symptoms" | "lfk";

export function DiaryTabsClient({
  symptomsPanel,
  lfkPanel,
}: {
  symptomsPanel: ReactNode;
  lfkPanel: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: TabKey = searchParams.get("tab") === "lfk" ? "lfk" : "symptoms";

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        const next = v === "lfk" ? "lfk" : "symptoms";
        router.replace(`/app/patient/diary?tab=${next}`, { scroll: false });
      }}
      className="flex flex-col gap-4"
    >
      {/* top-14 (3.5rem) ≈ высота PatientHeader (py-2 + ряд иконок size-10) */}
      <div
        className="safe-bleed-x sticky top-14 z-30 pb-4 pt-2"
        style={{
          background:
            "linear-gradient(to bottom, var(--patient-bg) 0%, var(--patient-bg) 85%, transparent 100%)",
        }}
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-none border-none bg-transparent p-0 shadow-none">
          <TabsTrigger
            value="symptoms"
            className="h-auto rounded-lg bg-transparent py-2.5 text-base text-[var(--patient-text-muted)] shadow-none after:hidden data-active:bg-[var(--patient-color-primary-soft)]/40 data-active:font-semibold data-active:text-[var(--patient-color-primary)] data-active:shadow-none"
          >
            Симптомы
          </TabsTrigger>
          <TabsTrigger
            value="lfk"
            className="h-auto rounded-lg bg-transparent py-2.5 text-base text-[var(--patient-text-muted)] shadow-none after:hidden data-active:bg-[var(--patient-color-primary-soft)]/40 data-active:font-semibold data-active:text-[var(--patient-color-primary)] data-active:shadow-none"
          >
            ЛФК
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="symptoms" className="flex flex-col gap-4">
        {symptomsPanel}
      </TabsContent>
      <TabsContent value="lfk" className="flex flex-col gap-4">
        {lfkPanel}
      </TabsContent>
    </Tabs>
  );
}
