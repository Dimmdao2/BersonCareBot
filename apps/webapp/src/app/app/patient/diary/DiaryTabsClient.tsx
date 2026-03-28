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
      <div className="safe-bleed-x sticky top-14 z-30 border-b border-border/60 bg-[var(--patient-bg)] py-2 supports-[backdrop-filter]:backdrop-blur-sm">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg bg-muted/70 p-1">
          <TabsTrigger
            value="symptoms"
            className="rounded-md py-2.5 text-muted-foreground shadow-none after:hidden data-active:bg-primary/10 data-active:font-semibold data-active:text-primary"
          >
            Симптомы
          </TabsTrigger>
          <TabsTrigger
            value="lfk"
            className="rounded-md py-2.5 text-muted-foreground shadow-none after:hidden data-active:bg-primary/10 data-active:font-semibold data-active:text-primary"
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
