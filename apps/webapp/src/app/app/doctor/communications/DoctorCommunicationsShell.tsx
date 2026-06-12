"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorCommunicationsTabsNav } from "./DoctorCommunicationsTabsNav";
import {
  COMMUNICATIONS_BASE,
  COMMUNICATIONS_DEFAULT_TAB,
  communicationsTabFromQuery,
  type CommunicationsTabId,
} from "./doctorCommunicationsTabs";
import {
  COMMUNICATIONS_TAB_REGISTRY,
  type CommunicationsTabProps,
} from "./communicationsTabRegistry";

/**
 * Динамические компоненты табов — строятся один раз при загрузке модуля, а не при каждом рендере.
 * next/dynamic кэширует чанки: переключение между уже открытыми табами мгновенное.
 */
const DYNAMIC_TABS = new Map<CommunicationsTabId, ComponentType<CommunicationsTabProps>>(
  COMMUNICATIONS_TAB_REGISTRY.map((entry) => [
    entry.id,
    dynamic(entry.loader, { ssr: false }) as ComponentType<CommunicationsTabProps>,
  ]),
);

function readDeepLinksFromSearchParams(
  params: URLSearchParams,
): Partial<Record<CommunicationsTabId, Record<string, string>>> {
  const initial: Partial<Record<CommunicationsTabId, Record<string, string>>> = {};
  for (const entry of COMMUNICATIONS_TAB_REGISTRY) {
    const tabParams: Record<string, string> = {};
    for (const key of entry.deepLinkKeys) {
      const val = params.get(key);
      if (val) tabParams[key] = val;
    }
    if (Object.keys(tabParams).length > 0) {
      initial[entry.id] = tabParams;
    }
  }
  return initial;
}

export type DoctorCommunicationsShellProps = {
  /** Начальный таб (от серверной страницы). Если не задан — берётся из URL ?tab=. */
  initialTab?: CommunicationsTabId;
  /** Кросс-таб бейджи непрочитанных (загружаются сервером). */
  badges?: Partial<Record<CommunicationsTabId, number>>;
  /** SSR-данные конкретных табов (ключ — id таба). Сейчас используется для comments. */
  initialTabData?: Partial<Record<CommunicationsTabId, unknown>>;
};

/**
 * Клиентский контейнер-шелл «Коммуникации».
 *
 * Паттерн keepMounted: таб монтируется при первом открытии и скрывается (hidden)
 * при переходе на другой — без размонтирования. Переключение мгновенное.
 *
 * URL-sync: смена таба и deep-link параметров отражается в ?tab= и
 * ключах-параметрах через history.replaceState (без полной навигации).
 */
export function DoctorCommunicationsShell({
  initialTab,
  badges,
  initialTabData,
}: DoctorCommunicationsShellProps) {
  const resolvedInit: CommunicationsTabId = (() => {
    if (initialTab) return initialTab;
    if (typeof window !== "undefined") {
      return communicationsTabFromQuery(new URLSearchParams(window.location.search).get("tab"));
    }
    return COMMUNICATIONS_DEFAULT_TAB;
  })();

  const [activeTab, setActiveTab] = useState<CommunicationsTabId>(resolvedInit);
  const activeTabRef = useRef(activeTab);

  // Множество смонтированных табов — только растёт (keepMounted).
  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<CommunicationsTabId>>(
    () => new Set<CommunicationsTabId>([resolvedInit]),
  );

  // Текущие deep-link параметры по каждому табу (из URL при первом клиентском рендере).
  const [deepLinks, setDeepLinks] = useState<
    Partial<Record<CommunicationsTabId, Record<string, string>>>
  >(() =>
    typeof window !== "undefined"
      ? readDeepLinksFromSearchParams(new URLSearchParams(window.location.search))
      : {},
  );
  const deepLinksRef = useRef(deepLinks);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    deepLinksRef.current = deepLinks;
  }, [deepLinks]);

  // Восстанавливаем состояние при навигации браузера (back / forward).
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = communicationsTabFromQuery(params.get("tab"));
      setActiveTab(tab);
      setMountedTabs((prev) => new Set([...prev, tab]));
      setDeepLinks(readDeepLinksFromSearchParams(params));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const buildTabUrl = useCallback(
    (tabId: CommunicationsTabId, tabDeepLinks: Record<string, string>): string => {
      const params = new URLSearchParams({ tab: tabId });
      for (const [k, v] of Object.entries(tabDeepLinks)) {
        if (v) params.set(k, v);
      }
      return `${COMMUNICATIONS_BASE}?${params.toString()}`;
    },
    [],
  );

  const handleTabChange = useCallback(
    (tabId: CommunicationsTabId) => {
      setActiveTab(tabId);
      setMountedTabs((prev) => new Set([...prev, tabId]));
      window.history.replaceState(
        null,
        "",
        buildTabUrl(tabId, deepLinksRef.current[tabId] ?? {}),
      );
    },
    [buildTabUrl],
  );

  const handleDeepLinkChange = useCallback(
    (tabId: CommunicationsTabId, key: string, value: string | null) => {
      // Side effects (history + ref) must run in the event handler, NOT inside a
      // setState updater — the updater executes during render, and replaceState there
      // updates the Router mid-render ("setState in render" warning).
      const prev = deepLinksRef.current;
      const tabParams = { ...(prev[tabId] ?? {}) };
      if (value === null) delete tabParams[key];
      else tabParams[key] = value;
      const next = { ...prev, [tabId]: tabParams };
      deepLinksRef.current = next;
      setDeepLinks(next);
      if (activeTabRef.current === tabId) {
        window.history.replaceState(null, "", buildTabUrl(tabId, tabParams));
      }
    },
    [buildTabUrl],
  );

  return (
    <DoctorAppShell title="Коммуникации">
      <DoctorCommunicationsTabsNav
        activeTab={activeTab}
        badges={badges}
        onTabClick={handleTabChange}
      />
      {COMMUNICATIONS_TAB_REGISTRY.map((entry) => {
        if (!mountedTabs.has(entry.id)) return null;
        const TabComponent = DYNAMIC_TABS.get(entry.id)!;
        const tabId = entry.id;
        return (
          <div key={tabId} hidden={tabId !== activeTab}>
            <TabComponent
              deepLinkParams={deepLinks[tabId] ?? {}}
              onDeepLinkChange={(key, value) => handleDeepLinkChange(tabId, key, value)}
              initialData={initialTabData?.[tabId]}
              isActive={tabId === activeTab}
            />
          </div>
        );
      })}
    </DoctorAppShell>
  );
}
