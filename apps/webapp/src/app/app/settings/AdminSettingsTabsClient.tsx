"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ADMIN_SETTINGS_NAV_MIN_WIDTH_PX } from "@/shared/lib/platform";
import { useViewportMinWidth } from "@/shared/hooks/useViewportMinWidth";

const ADMIN_SECTIONS = [
  { value: "diagnostics", label: "Админ: режим" },
  { value: "app-params", label: "Параметры приложения" },
  { value: "auth", label: "Авторизация" },
  { value: "access", label: "Доступ и роли" },
  { value: "integrations", label: "Интеграции" },
  { value: "catalog", label: "Каталог записи" },
  { value: "audit-log", label: "Лог операций" },
] as const;

export type AdminSettingsTabsClientProps = {
  diagnostics: ReactNode;
  appParams: ReactNode;
  auth: ReactNode;
  access: ReactNode;
  integrations: ReactNode;
  catalog: ReactNode;
  auditLog: ReactNode;
};

export function AdminSettingsTabsClient({
  diagnostics,
  appParams,
  auth,
  access,
  integrations,
  catalog,
  auditLog,
}: AdminSettingsTabsClientProps) {
  const [value, setValue] = useState<string>("diagnostics");
  const showSidebarNav = useViewportMinWidth(ADMIN_SETTINGS_NAV_MIN_WIDTH_PX);

  return (
    <div className="flex flex-col gap-4">
      {!showSidebarNav && (
        <div>
          <label htmlFor="admin-settings-section" className="mb-2 block text-sm font-medium text-foreground">
            Раздел настроек
          </label>
          <select
            id="admin-settings-section"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={cn(
              "flex h-10 w-full max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
              "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            {ADMIN_SECTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <Tabs
        value={value}
        onValueChange={setValue}
        orientation="vertical"
        className="w-full gap-4 sm:gap-6 lg:gap-8"
      >
        <TabsList
          variant="default"
          className={cn(
            "h-auto w-full shrink-0 flex-col items-stretch justify-start gap-1 rounded-lg border border-border/50 bg-muted/40 p-1.5",
            showSidebarNav ? "flex sticky top-20 w-52 self-start lg:w-56" : "hidden",
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
          <TabsContent value="app-params" className="mt-0">
            {appParams}
          </TabsContent>
          <TabsContent value="auth" className="mt-0">
            {auth}
          </TabsContent>
          <TabsContent value="access" className="mt-0">
            {access}
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
