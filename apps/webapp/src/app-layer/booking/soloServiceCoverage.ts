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
 * Специалиста здесь НЕ создаём. Владелец 11.09, дословно: «Специалистов создает, блядь, либо тот
 * факт, что это сам по себе специалист зарегистрировался, и это первый момент создания его
 * кабинета, либо его создает администратор, приглашая, кто еще может, где создавать
 * специалистов». Регистрация это и делает — `app.provision_specialist_owner` заводит строку
 * `be_specialists` и прописывает её в членство. Прежняя редакция этого файла (и вызов
 * `ensureDefaultSpecialist` из браузера перед созданием филиала) заводила специалиста «на всякий
 * случай»: замер 11.09 показал 0 организаций без специалиста и на DEV, и на TEST — ветка не
 * срабатывала никогда, зато при двойном клике давала ВТОРОГО специалиста
 * (`upsertSpecialist` без `id` — обычный INSERT без проверки на повтор).
 *
 * Нет специалиста — покрывать нечего, выходим молча: организация в этом состоянии сломана, и
 * подмена её починки новой строкой прячет поломку.
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
  // вместе с ним.
  const specialist = specialists.find((s) => s.isActive) ?? specialists[0] ?? null;
  if (!specialist) return;

  await ctx.service.services.ensureSoloServiceCoverage({
    organizationId: ctx.organizationId,
    specialistId: specialist.id,
    ...scope,
  });
}
