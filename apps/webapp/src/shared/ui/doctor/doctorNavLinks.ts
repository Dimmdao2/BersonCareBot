/** Навигация кабинета врача: верхнеуровневые пункты (desktop sidebar и mobile Sheet). */

import { routePaths } from '@/app-layer/routes/paths';
import {
  hasLaunchCapability,
  type LaunchCapability,
} from '@/app-layer/guards/workspaceCapabilities';
import { resolvePatientTerms } from '@/modules/system-settings/patientTerms';

/** Устаревший ключ: один открытый кластер. Читается только для миграции в формат множества. */
export const DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY = 'doctorMenu.openCluster.v1';

/** Ключ localStorage: JSON-массив с одним id открытого кластера (аккордеон — только один блок). */
export const DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY = 'doctorMenu.openClusters.v1';

/** Дефолтный открытый кластер при первом заходе. */
export const DOCTOR_MENU_DEFAULT_CLUSTER_ID = 'library';

/** Ключ счётчика для бейджа пункта меню врача (навигация). */
export type DoctorMenuBadgeKey =
  | 'messagesUnread'
  | 'registrationSystemFailures'
  | 'pendingProgramTests'
  | 'todayAttention'
  | 'communicationsTotal';

export type DoctorMenuLinkItem = {
  id: string;
  label: string;
  href?: string;
  /** Подпункты — пункт рендерится как раскрывающийся аккордеон без перехода по клику. */
  items?: DoctorMenuLinkItem[];
  badgeKey?: DoctorMenuBadgeKey;
  /** Visibility tier: omitted means regular doctor workspace access. */
  accessTier?: DoctorMenuAccessTier;
  /** Optional product mechanic layered on top of the clinical workspace capability. */
  requiresCoursesEntitlement?: boolean;
  requiresPromoEntitlement?: boolean;
  requiresCmsEntitlement?: boolean;
  requiresPatientHomeTodayEntitlement?: boolean;
};

export type DoctorMenuAccessTier = 'doctor' | 'staff' | 'clinic_admin' | 'global_admin';

export type DoctorMenuAccess = {
  capabilities: readonly LaunchCapability[];
  coursesEnabled?: boolean;
  promoEnabled?: boolean;
  cmsEnabled?: boolean;
  patientHomeTodayEnabled?: boolean;
};

export function getDoctorShellHomeHref(access: DoctorMenuAccess): string {
  if (hasLaunchCapability(access.capabilities, 'platform.operations'))
    return '/app/admin/system-health';
  if (hasLaunchCapability(access.capabilities, 'clinical.workspace')) return routePaths.doctor;
  if (hasLaunchCapability(access.capabilities, 'organization.management')) {
    return routePaths.settings;
  }
  if (hasLaunchCapability(access.capabilities, 'account.self')) return routePaths.account;
  return routePaths.root;
}

export function isDoctorMenuLinkVisible(
  item: DoctorMenuLinkItem,
  access: DoctorMenuAccess,
): boolean {
  if (item.requiresCoursesEntitlement && !access.coursesEnabled) return false;
  if (item.requiresPromoEntitlement && !access.promoEnabled) return false;
  if (item.requiresCmsEntitlement && !access.cmsEnabled) return false;
  if (item.requiresPatientHomeTodayEntitlement && !access.patientHomeTodayEnabled) return false;
  const tier = item.accessTier ?? 'doctor';
  if (tier === 'doctor') return hasLaunchCapability(access.capabilities, 'clinical.workspace');
  if (tier === 'staff') {
    return (
      hasLaunchCapability(access.capabilities, 'organization.management') ||
      hasLaunchCapability(access.capabilities, 'clinical.workspace')
    );
  }
  if (tier === 'clinic_admin') {
    return hasLaunchCapability(access.capabilities, 'organization.management');
  }
  return hasLaunchCapability(access.capabilities, 'platform.operations');
}

const RAW_DOCTOR_MENU_ITEMS: DoctorMenuLinkItem[] = [
  { id: 'today', label: 'Сегодня', href: '/app/doctor', badgeKey: 'todayAttention' },
  {
    id: 'patient-home',
    label: 'Главная пациента',
    href: '/app/doctor/patient-home',
    requiresPatientHomeTodayEntitlement: true,
  },
  { id: 'patients', label: 'Пациенты', href: '/app/doctor/patients' },
  {
    id: 'schedule',
    label: 'Расписание',
    href: routePaths.doctorSchedule,
    accessTier: 'staff',
  },
  {
    id: 'communications',
    label: 'Коммуникации',
    href: routePaths.doctorCommunications,
    badgeKey: 'communicationsTotal',
  },
  {
    id: 'library',
    label: 'Каталог ЛФК',
    items: [
      { id: 'exercises', label: 'Упражнения', href: '/app/doctor/exercises' },
      { id: 'lfk-templates', label: 'Комплексы ЛФК', href: '/app/doctor/lfk-templates' },
      { id: 'clinical-tests', label: 'Клинические тесты', href: '/app/doctor/clinical-tests' },
      { id: 'test-sets', label: 'Наборы тестов', href: '/app/doctor/test-sets' },
      { id: 'recommendations', label: 'Рекомендации', href: '/app/doctor/recommendations' },
      {
        id: 'treatment-program-templates',
        label: 'Шаблоны программ',
        href: '/app/doctor/treatment-program-templates',
      },
      {
        id: 'treatment-program-promo',
        label: 'Промо-программа',
        href: '/app/doctor/treatment-program-promo',
        requiresPromoEntitlement: true,
      },
      { id: 'references', label: 'Справочники', href: '/app/doctor/references' },
    ],
  },
  {
    id: 'content',
    label: 'Контент',
    href: '/app/doctor/content',
    requiresCmsEntitlement: true,
  },
  {
    id: 'files-and-media',
    label: 'Файлы и медиа',
    href: '/app/doctor/content/library',
    requiresCmsEntitlement: true,
  },
  {
    id: 'courses',
    label: 'Курсы',
    href: '/app/doctor/courses',
    requiresCoursesEntitlement: true,
  },
  {
    id: 'settings',
    label: 'Настройки',
    href: routePaths.settings,
    accessTier: 'clinic_admin',
  },
  { id: 'account', label: 'Аккаунт', href: routePaths.account, accessTier: 'staff' },
  // NOTE: the platform operator's own destinations (analytics + the former "system" cluster)
  // moved out to `platformNavLinks.ts` — the platform shell has its own dedicated, flat
  // navigation now (owner ruling 2026-07-26: the global admin is not a doctor and does not
  // share this menu).
];

/**
 * Плоский список верхнеуровневых пунктов с применённой фильтрацией по `accessTier`.
 * Подпункты у раскрывающихся пунктов тоже фильтруются; если все подпункты отфильтровались и `href` нет —
 * пункт не попадает в результат.
 *
 * @param access — роль, режим администратора и право управления клиникой.
 * @param patientLabel — значение настройки `patient_label` (raw singular из БД).
 *   Нормализуется через `resolvePatientTerms` — регистронезависимо.
 */
export function getDoctorMenuItems(
  access: DoctorMenuAccess,
  patientLabel?: string,
): DoctorMenuLinkItem[] {
  const { patientPluralLabel } = resolvePatientTerms(patientLabel);
  return RAW_DOCTOR_MENU_ITEMS.filter((item) => isDoctorMenuLinkVisible(item, access))
    .map((item) => {
      if (!item.items) {
        if (item.id === 'patients') {
          return { ...item, label: patientPluralLabel };
        }
        return item;
      }
      const filtered = item.items.filter((sub) => isDoctorMenuLinkVisible(sub, access));
      return { ...item, items: filtered };
    })
    .filter((item) => !item.items || item.items.length > 0 || item.href !== undefined);
}

/** Возвращает `true` если пункт с таким `id` является раскрывающимся (имеет `items`). */
export function isDoctorMenuClusterId(id: string): boolean {
  return RAW_DOCTOR_MENU_ITEMS.some((i) => i.id === id && !!i.items);
}

/** Плоский список всех пунктов навигации (верхнеуровневые ссылки + подпункты), без служебных действий. */
export const DOCTOR_MENU_LINKS: DoctorMenuLinkItem[] = RAW_DOCTOR_MENU_ITEMS.flatMap((item) =>
  item.items ? item.items : [item],
);

/** Активный пункт навигации по текущему пути. */
export function isDoctorNavItemActive(href: string, pathname: string): boolean {
  const [path] = href.split('?');
  const norm = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  if (path === '/app/doctor') {
    return norm === '/app/doctor';
  }
  /** Хаб CMS не считается активным на странице медиатеки (отдельный пункт меню). */
  if (path === '/app/doctor/content') {
    if (norm === '/app/doctor/content') return true;
    if (norm.startsWith('/app/doctor/content/library')) return false;
    return norm.startsWith(`${path}/`);
  }
  return norm === path || norm.startsWith(`${path}/`);
}
