"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const ADMIN_SECTIONS = [
  { value: "diagnostics", label: "Режимы" },
  { value: "system-health", label: "Здоровье системы" },
  { value: "app-params", label: "Параметры приложения" },
  { value: "auth", label: "Авторизация" },
  { value: "integrations", label: "Интеграции" },
  { value: "catalog", label: "Каталог записи" },
  { value: "audit-log", label: "Лог операций" },
] as const;

export type AdminSettingsTabsClientProps = {
  initialTab?: string;
  diagnostics: ReactNode;
  systemHealth: ReactNode;
  appParams: ReactNode;
  auth: ReactNode;
  integrations: ReactNode;
  catalog: ReactNode;
  auditLog: ReactNode;
};

const ADMIN_TAB_IDS = new Set<string>(ADMIN_SECTIONS.map((s) => s.value));

export function AdminSettingsTabsClient({
  initialTab,
  diagnostics,
  systemHealth,
  appParams,
  auth,
  integrations,
  catalog,
  auditLog,
}: AdminSettingsTabsClientProps) {
  const resolvedInitial = initialTab && ADMIN_TAB_IDS.has(initialTab) ? initialTab : "diagnostics";
  const [value, setValue] = useState<string>(resolvedInitial);

  return (
    <div className="flex flex-col gap-4">
      <label className="sm:hidden">
        <span className="mb-1.5 block text-xs text-muted-foreground">Раздел админки</span>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
            "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          )}
        >
          {ADMIN_SECTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <Tabs
        value={value}
        onValueChange={setValue}
        orientation="vertical"
        className="w-full flex-col gap-4 sm:flex-row sm:gap-6 lg:gap-8"
      >
        <TabsList
          variant="default"
          className={cn(
            "hidden sm:flex",
            "flex h-auto w-full shrink-0 flex-col items-stretch justify-start gap-1 rounded-lg border border-border/50 bg-muted/40 p-1.5",
            "sm:sticky sm:top-20 sm:w-52 sm:self-start lg:w-56",
          )}
        >
          {ADMIN_SECTIONS.map((s) => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className="w-full justify-start whitespace-normal px-2.5 py-2 text-left text-xs sm:text-sm"
            >
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-w-0 flex-1 space-y-0">
          <TabsContent value="diagnostics" className="mt-0">
            {diagnostics}
          </TabsContent>
          <TabsContent value="system-health" className="mt-0">
            {systemHealth}
          </TabsContent>
          <TabsContent value="app-params" className="mt-0">
            {appParams}
          </TabsContent>
          <TabsContent value="auth" className="mt-0">
            {auth}
          </TabsContent>
          <TabsContent value="integrations" className="mt-0 space-y-6">
            {integrations}
          </TabsContent>
          <TabsContent value="catalog" className="mt-0 space-y-6">
            {catalog}
          </TabsContent>
          <TabsContent value="audit-log" className="mt-0">
            {auditLog}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
