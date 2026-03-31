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
      <div className="safe-bleed-x sticky top-14 z-30 py-2">
        <TabsList
          variant="line"
          className="grid h-auto w-full grid-cols-2 gap-2 rounded-none bg-transparent p-0"
        >
          <TabsTrigger
            value="symptoms"
            className="h-auto rounded-lg bg-transparent py-2.5 text-muted-foreground shadow-none after:hidden data-active:bg-primary/20 data-active:font-semibold data-active:text-primary data-active:shadow-none dark:data-active:bg-primary/25"
          >
            Симптомы
          </TabsTrigger>
          <TabsTrigger
            value="lfk"
            className="h-auto rounded-lg bg-transparent py-2.5 text-muted-foreground shadow-none after:hidden data-active:bg-primary/20 data-active:font-semibold data-active:text-primary data-active:shadow-none dark:data-active:bg-primary/25"
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
