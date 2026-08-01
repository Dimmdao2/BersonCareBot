import { getServerRuntimeBool } from '@/modules/system-settings/configAdapter';

/**
 * Единственное место, где читается платформенный переключатель второго фактора
 * (`auth_2fa_enabled`, админка → Вход). Оба потребителя — страж страниц
 * (`isRestrictedStaffSecuritySession`) и решение о переходе после входа — обязаны спрашивать
 * здесь, иначе переключатель становится декорацией в одной половине системы: страж пускает, а
 * вход всё равно уводит на настройку фактора.
 *
 * Ошибка чтения настройки трактуется как «выключено»: недоступная база не должна запирать
 * персонал, у которого второй фактор не заведён.
 */
export async function platformRequiresStaffTwoFactor(): Promise<boolean> {
  try {
    return await getServerRuntimeBool('auth_2fa_enabled');
  } catch {
    return false;
  }
}
