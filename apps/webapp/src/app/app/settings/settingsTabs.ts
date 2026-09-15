import { routePaths } from '@/app-layer/routes/paths';

/**
 * Разделы «Профиль и настройки» (`/app/settings`).
 *
 * Владелец 15.09.2026: «давай разделим настройки на смысловые блоки. а то у нас порядок полностью
 * хаотичен». До этого дня было пять вкладок, и одна из них — «Организация» — держала двенадцать
 * разделов подряд: брендинг, домен, слаг, ссылка записи, визитка, рабочее пространство, второй
 * фактор персонала, «Сегодня», напоминания, оплаты, каналы доставки, календарь. Порядок в ней не
 * значил ничего, и найти настройку можно было только перечитав экран целиком.
 *
 * Состав вкладок — решение владельца, записано в
 * `docs/_TODO/SETTINGS_TABS_RESTRUCTURE_2026-09-15.md`. Здесь только данные навигации; кто какую
 * вкладку видит, решает `page.tsx`.
 *
 * «Команда» в девятку владельца не входит: она про КЛИНИКУ, а девятка описана для соло. Вкладка
 * остаётся отдельной строкой и показывается только составу с командой — деление настроек клиники
 * владелец отложил («Для клиники там деление будет, но надо продумать, это позже»).
 */
export type SettingsTabId =
  | 'account'
  | 'profile'
  | 'public'
  | 'branding'
  | 'booking'
  | 'payments'
  | 'workspace'
  | 'notifications'
  | 'integrations'
  | 'team';

export type SettingsTab = {
  id: SettingsTabId;
  label: string;
  href: string;
};

const SETTINGS_BASE = routePaths.settings;

/** Заголовок экрана; контейнер в шапке — ссылка с именем организации (владелец 15.09). */
export const SETTINGS_PAGE_TITLE = 'Профиль и настройки';

export const ALL_SETTINGS_TABS: SettingsTab[] = [
  { id: 'account', label: 'Аккаунт', href: `${SETTINGS_BASE}?tab=account` },
  // Владелец 10.09: в настройках говорим «организация», а не «клиника» — соло-специалист такой же
  // арендатор, и обе поверхности обслуживают одни и те же писатели.
  { id: 'profile', label: 'Профиль', href: `${SETTINGS_BASE}?tab=profile` },
  { id: 'public', label: 'Публичная страница', href: `${SETTINGS_BASE}?tab=public` },
  { id: 'branding', label: 'Брендинг', href: `${SETTINGS_BASE}?tab=branding` },
  { id: 'booking', label: 'Запись', href: `${SETTINGS_BASE}?tab=booking` },
  { id: 'payments', label: 'Приём оплаты', href: `${SETTINGS_BASE}?tab=payments` },
  { id: 'workspace', label: 'Рабочее место', href: `${SETTINGS_BASE}?tab=workspace` },
  { id: 'notifications', label: 'Уведомления', href: `${SETTINGS_BASE}?tab=notifications` },
  { id: 'integrations', label: 'Интеграции', href: `${SETTINGS_BASE}?tab=integrations` },
  { id: 'team', label: 'Команда', href: `${SETTINGS_BASE}?tab=team` },
];

/**
 * Прежние адреса вкладок. Живая ссылка, закладка и письмо не должны умирать от перестановки
 * разделов, поэтому старое значение `?tab=` отвечает переходом на новое место, а не 404 и не
 * молчаливым «первая вкладка».
 *
 * `specialist` и `organization` оба уходят в «Профиль»: там теперь и ФИО специалиста, и имя
 * организации. `billing` — в «Аккаунт» (тариф и место владелец назвал именно там). `install` уходит
 * в «Рабочее место» («Установка приложения на устройство — это в настройках интерфейса»).
 */
export const LEGACY_SETTINGS_TAB_REDIRECTS: Record<string, SettingsTabId> = {
  organization: 'profile',
  specialist: 'profile',
  billing: 'account',
  install: 'workspace',
};
