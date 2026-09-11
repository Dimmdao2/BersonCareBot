import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { resolveDoctorWorkspaceComposition } from '@/modules/doctor-workspace/composition';
import type { AdminBookingEngineContext } from '@/app/api/admin/booking-engine/_requireClinicManagementBookingEngine';

/**
 * Соло это или клиника. Решает ТАРИФ, а не число людей: режим берётся у
 * `resolveDoctorWorkspaceComposition` — единственной записи этого правила (решение владельца
 * 10.09: «число мест — не показатель, админ клиники может начинать с одного себя и приглашать
 * других»). Заводить здесь второе определение «соло» нельзя: клиника из одного человека обязана
 * назначать специалистов руками (#1102 §1.2).
 *
 * Только чтение — вызывается ДО входа в принципала записи.
 */
export async function isSoloWorkspace(ctx: AdminBookingEngineContext): Promise<boolean> {
  const deps = buildAppDeps();
  const [teamEntitlement, seats] = await Promise.all([
    requireEntitlementForReadAction({ organizationId: ctx.organizationId }, 'clinic_team'),
    deps.clinicSeats.getSeatStatus(ctx.organizationId, ctx.session.user.userId),
  ]);
  return (
    resolveDoctorWorkspaceComposition({ clinicTeamEntitled: teamEntitlement.ok, seats }) === 'solo'
  );
}

/**
 * Довести соло до состояния «услуга привязана к нему во всех его активных филиалах» — после
 * появления новой услуги, новой (или снова включённой) локации либо самого специалиста.
 *
 * Решение владельца 11.09 (#1102 §1.1), дословно: «Для сола настраивать автоматику обязательно.
 * Соло-специалист не должен включать в услуги, добавлять в себя как специалиста. Если он добавил
 * услугу, значит, она его, значит, он к ней подключен автоматически. Ему вообще нигде себя
 * выбирать не надо.»
 *
 * Специалист соло СОЗДАЁТСЯ здесь, если его ещё нет. До этой правки его заводил браузер
 * (`ensureDefaultSpecialist`) перед созданием локации, а перед созданием услуги — не заводил
 * никто; ровно поэтому автоматика была сделана наполовину и услугу приходилось привязывать к
 * филиалу галкой руками.
 *
 * Дописываются только НЕДОСТАЮЩИЕ пары: снятая вручную галка на экране «Доступность услуг по
 * филиалам» не воскресает (#1102 S-01, S-03).
 *
 * Пишет — значит вызывается ВНУТРИ принципала записи кабинета; режим уже проверен
 * `isSoloWorkspace`, чтобы чтение прав и мест не уезжало под принципала записи.
 */
export async function ensureSoloServiceCoverage(
  ctx: AdminBookingEngineContext,
  scope: { serviceId?: string; branchId?: string } = {},
): Promise<void> {
  const specialists = await ctx.service.catalog.listSpecialists(ctx.organizationId);
  // Выключенный специалист тоже годится: привязки к нему остаются живыми строками и оживают
  // вместе с ним. Завести второго вместо выключенного означало бы развести соло на двоих.
  const existing = specialists.find((s) => s.isActive) ?? specialists[0] ?? null;
  const specialistId =
    existing?.id ??
    (
      await ctx.service.catalog.upsertSpecialist({
        organizationId: ctx.organizationId,
        fullName:
          (await ctx.service.organization.getOrganization(ctx.organizationId))?.title?.trim() ||
          'Специалист',
        description: null,
        avatarMediaId: null,
        fullDescriptionMarkdown: null,
        cardIsPublished: false,
        isActive: true,
        sortOrder: 0,
      })
    ).id;

  await ctx.service.services.ensureSoloServiceCoverage({
    organizationId: ctx.organizationId,
    specialistId,
    ...scope,
  });
}
