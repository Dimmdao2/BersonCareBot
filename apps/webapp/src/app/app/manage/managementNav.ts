export type ManagementNavEntry = {
  id: 'team' | 'catalog' | 'booking' | 'settings' | 'billing';
  label: string;
  href: string;
};

/** Existing writers remain their single owner; this registry is composition, not a second engine. */
export const MANAGEMENT_NAV: readonly ManagementNavEntry[] = [
  { id: 'team', label: 'Команда', href: '/app/settings?tab=team' },
  { id: 'catalog', label: 'Каталог', href: '/app/doctor/schedule?tab=setup&section=locations' },
  { id: 'booking', label: 'Онлайн-запись', href: '/app/doctor/schedule?tab=setup&section=form' },
  { id: 'settings', label: 'Настройки клиники', href: '/app/settings?tab=organization' },
  { id: 'billing', label: 'Тариф', href: '/app/settings?tab=billing' },
];
