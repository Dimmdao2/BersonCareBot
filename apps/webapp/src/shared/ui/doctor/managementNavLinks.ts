import type { DoctorMenuAccess, DoctorMenuLinkItem } from './doctorNavLinks';

/**
 * Clinic-management navigation is deliberately separate from the clinical doctor menu.
 * Its destinations reuse the established writers; the registry owns only mode chrome.
 */
const MANAGEMENT_MENU_ITEMS: readonly DoctorMenuLinkItem[] = [
  {
    id: 'team',
    label: 'Команда',
    items: [
      { id: 'members', label: 'Участники и доступ', href: '/app/settings?tab=team' },
      { id: 'specialists', label: 'Профили специалистов', href: '/app/manage?section=specialists' },
    ],
  },
  {
    id: 'catalog',
    label: 'Каталог',
    items: [
      { id: 'locations', label: 'Филиалы', href: '/app/manage' },
      { id: 'services', label: 'Услуги', href: '/app/manage?section=services' },
      { id: 'packages', label: 'Абонементы', href: '/app/manage?section=packages' },
    ],
  },
  { id: 'online-booking', label: 'Онлайн-запись', href: '/app/manage/online-booking' },
  { id: 'settings', label: 'Настройки организации', href: '/app/settings?tab=organization' },
  { id: 'billing', label: 'Тариф', href: '/app/settings?tab=billing' },
];

/** Management capability is resolved by the server shell; this registry does not infer roles. */
export function getManagementMenuItems(access: DoctorMenuAccess): DoctorMenuLinkItem[] {
  return access.capabilities.includes('organization.management') ? [...MANAGEMENT_MENU_ITEMS] : [];
}

export const MANAGEMENT_MENU_LINKS = MANAGEMENT_MENU_ITEMS;
