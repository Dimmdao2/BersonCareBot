'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DoctorMobileSectionTabs } from '@/shared/ui/doctor/shell/DoctorMobileSectionTabs';
import { DoctorShellMobileBottomTabsRegistration } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';
import type { SettingsTab, SettingsTabId } from './settingsTabs';

/**
 * Мобильные вкладки настроек — нижней полосой, как в «Расписании» (владелец 15.09: «на мобильном
 * вкладки в настройках сделать нижней полоской как в расписании»). Тот же самый компонент полосы
 * (`DoctorMobileSectionTabs`) и тот же способ её пристыковать (`DoctorShellMobileBottomTabsRegistration`),
 * то есть общий контракт chrome, а не вторая похожая полоса со своей вёрсткой.
 *
 * Отличие от «Расписания» одно и вынужденное: там три раздела и они помещаются в ряд, здесь их до
 * десяти — поэтому `scrollable`. Раздел переключается настоящей навигацией (`?tab=`), а не локальным
 * состоянием: адрес вкладки остаётся ссылкой, которую можно открыть, переслать и положить в закладки.
 */
export function SettingsMobileTabsDock({
  tabs,
  activeTab,
}: {
  tabs: SettingsTab[];
  activeTab: SettingsTabId;
}) {
  const router = useRouter();
  const hrefById = useMemo(
    () => new Map(tabs.map((tab) => [tab.id, tab.href] as const)),
    [tabs],
  );
  const content = useMemo(
    () => (
      <DoctorMobileSectionTabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        activeTab={activeTab}
        onTabChange={(id) => {
          const href = hrefById.get(id);
          if (href) router.push(href);
        }}
        ariaLabel="Разделы настроек"
        scrollable
      />
    ),
    [activeTab, hrefById, router, tabs],
  );

  if (tabs.length < 2) return null;
  return <DoctorShellMobileBottomTabsRegistration content={content} />;
}
