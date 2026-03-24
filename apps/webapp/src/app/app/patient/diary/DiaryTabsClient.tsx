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
      className="stack gap-4"
    >
      <TabsList variant="line" className="w-full justify-start">
        <TabsTrigger value="symptoms">Симптомы</TabsTrigger>
        <TabsTrigger value="lfk">ЛФК</TabsTrigger>
      </TabsList>
      <TabsContent value="symptoms" className="stack gap-4">
        {symptomsPanel}
      </TabsContent>
      <TabsContent value="lfk" className="stack gap-4">
        {lfkPanel}
      </TabsContent>
    </Tabs>
  );
}
