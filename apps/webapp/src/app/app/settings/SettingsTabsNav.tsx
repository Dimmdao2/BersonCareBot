import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ALL_SETTINGS_TABS, type SettingsTabId } from './settingsTabs';
import { SettingsMobileTabsDock } from './SettingsMobileTabsDock';

type Props = {
  activeTab: SettingsTabId;
  /** Sections the current user may access — a section outside this list is never rendered. */
  visibleTabs: SettingsTabId[];
};

function visibleSettingsTabs(visibleTabs: SettingsTabId[]) {
  return ALL_SETTINGS_TABS.filter((tab) => visibleTabs.includes(tab.id));
}

/**
 * Десктоп и планшет: вкладки настроек стоят колонкой слева (владелец 15.09 — «сделай на десктопе и
 * планшете вкладки настроек по принципу справочников слева столбиком»). Разметка и состояния взяты
 * у эталона — `ReferencesSidebar` («Справочники»): карточка `bg-card` с рамкой и радиусом блока,
 * ссылки в столбик, активная подсвечена тонированным фоном с рамкой, а не заливкой primary.
 *
 * Колонка липкая: у настроек длинные вкладки («Запись», «Брендинг»), и уезжающий вверх список
 * заставлял бы прокручивать экран обратно ради перехода.
 *
 * Офсет — высота шапки ПЛЮС межблочный зазор, а не одна высота шапки. С голым
 * `--doctor-page-header-h` колонка при первой же прокрутке подскакивала на 12px вверх и вставала
 * впритык к шапке, подныривая под неё: она не уезжала совсем, но дёргалась и слипалась с шапкой.
 * Владелец 15.09: «навигация не должна липнуть к шапке, она не должна уезжать вверх». С зазором в
 * офсете точка прилипания совпадает с местом, где колонка стоит изначально, — она не двигается вовсе.
 */
function SettingsTabsSidebar({ activeTab, visibleTabs }: Props) {
  const tabs = visibleSettingsTabs(visibleTabs);
  if (tabs.length < 2) return null;

  return (
    <nav
      className="hidden shrink-0 self-start rounded-[var(--doctor-page-block-radius,12px)] border border-border bg-card p-3 md:sticky md:top-[calc(var(--doctor-page-header-h,0px)+0.75rem)] md:block md:w-52 lg:w-60"
      aria-label="Разделы настроек"
    >
      <ul className="flex flex-col gap-1">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center rounded-md border border-transparent px-2 py-2 text-sm hover:bg-muted',
                  active &&
                    'border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25',
                )}
              >
                <span className="truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Каркас экрана настроек: нижняя полоса вкладок на мобильном, колонка слева на md+, содержимое
 * вкладки — справа. `min-h-0 flex-1` держит вкладку «Запись»: она единственная идёт в
 * `layout="full-height"` и прокручивается внутри себя, поэтому колонка контента обязана быть
 * flex-остатком, а не расти по содержимому.
 *
 * Блоки вкладки идут ОДНОЙ колонкой на любой ширине. Две колонки на широком экране пробовали 15.09
 * по просьбе владельца и откатили по его же решению («плохо, верни одну колонку… на всех»): и сетка,
 * и потоковые колонки рвали вертикальный порядок настроек — короткий блок оказывался рядом с длинным,
 * а глаз терял, что за чем идёт.
 */
export function SettingsTabsLayout({
  activeTab,
  visibleTabs,
  children,
}: Props & { children: ReactNode }) {
  return (
    <>
      <SettingsMobileTabsDock tabs={visibleSettingsTabs(visibleTabs)} activeTab={activeTab} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:gap-4">
        <SettingsTabsSidebar activeTab={activeTab} visibleTabs={visibleTabs} />
        {/*
          Нижний отступ живёт здесь, а не на общем контейнере страницы. У контейнера
          (`DOCTOR_PAGE_CONTAINER_CLASS`) он есть — `pb-[var(--doctor-page-bottom-gutter,18px)]`, — но
          на длинной странице не виден: контейнер идёт `flex-1` в прокрутчике с заданной высотой, то
          есть его собственная коробка равна экрану, а содержимое из неё вытекает, и padding остаётся
          нарисованным где-то посреди прокрутки. Замер 15.09: после последнего блока «Аккаунта» до
          конца прокрутки 0px — и до моих правок тоже 0px, так что это не регрессия колонки, а
          давняя дыра. Здесь отступ принадлежит самому потоку блоков и виден всегда.
        */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 pb-[var(--doctor-page-bottom-gutter,18px)]">
          {children}
        </div>
      </div>
    </>
  );
}
