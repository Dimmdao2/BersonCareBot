import type { JoinBrand } from './JoinPatientClient';

/** Бренд поверхности, на которой открыли приглашение. Ровно то, что нужно решению. */
export type JoinSurfaceBrand = {
  organizationId: string | undefined;
  patientBrand: { logoUrl?: string } | undefined;
};

/**
 * Чей бренд стоит над приглашением. Решение целиком, без чтения запроса и без разметки.
 *
 * Владелец 10.09: «он видит логотип терапии, логотип клиники»; 11.09 уточнил разницу: «нет логотипа
 * клиники, потому что небрендированная. Логотип терапии как раз есть». Шапка показывает бренд ТОЙ
 * поверхности, на которой человек стоит, — тем же правилом, что уже действует на пациентском входе
 * (`TherapyGoLoginShell` против брендированного `PatientAppShell`).
 *
 * Логотип клиники требует совпадения её организации с организацией ПРИГЛАШЕНИЯ. Continuation можно
 * открыть на хосте чужой клиники: без сверки приглашение клиники A показалось бы под логотипом
 * клиники B — подмена арендатора на экране, который человек считает принадлежащим пригласившим.
 * Организация приглашения неизвестна (кука не совпала, ссылка протухла) — совпадения нет по
 * построению, и утверждать нечего.
 */
export function joinBrandFor(
  surface: JoinSurfaceBrand | null,
  inviteOrganizationId: string | null,
): JoinBrand {
  const patientBrand = surface?.patientBrand;
  // Клиничного бренда нет — поверхность наша: общий пациентский вход, куда уводит редирект с
  // чужого хоста. Безымянным этот экран быть не должен.
  if (!patientBrand) return { platformLockup: true };
  const sameClinic =
    inviteOrganizationId !== null && surface?.organizationId === inviteOrganizationId;
  return sameClinic && patientBrand.logoUrl ? { clinicLogoUrl: patientBrand.logoUrl } : {};
}
