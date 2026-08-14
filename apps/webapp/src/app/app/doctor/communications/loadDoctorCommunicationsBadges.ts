/**
 * Лёгкий общий загрузчик счётчиков-бейджей для таб-бара «Коммуникации»
 * (`DoctorCommunicationsTabsNav`). Каждая страница вкладки вызывает его, чтобы показать
 * непрочитанное по *другим* вкладкам (кросс-вкладочная синхронизация).
 *
 * Намеренно считает только дешёвые счётчики:
 * - `chats` — непрочитанные сообщения поддержки (`unreadFromUsers()`);
 *
 * `comments` сюда не входит: его источник (`loadDoctorExerciseCommentAttention`) обходит программы
 * всех клиентов на сопровождении и слишком тяжёл для вызова на каждой вкладке.
 *
 * Устойчив к сбоям: ошибка любого источника → 0; нулевые счётчики не попадают в результат
 * (бейдж не рисуется).
 */
import type { CommunicationsTabId } from './doctorCommunicationsTabs';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';

export type DoctorCommunicationsBadges = Partial<Record<CommunicationsTabId, number>>;

export type DoctorCommunicationsBadgesDeps = {
  messaging: {
    doctorSupport: {
      unreadFromUsers(params: {
        organizationId?: string;
        visibilityActor: PatientVisibilityActor;
      }): Promise<number>;
    };
  };
};

export async function loadDoctorCommunicationsBadges(
  deps: DoctorCommunicationsBadgesDeps,
  context: { organizationId: string; visibilityActor: PatientVisibilityActor },
): Promise<DoctorCommunicationsBadges> {
  const unreadChats = await deps.messaging.doctorSupport.unreadFromUsers(context).catch(() => 0);

  const badges: DoctorCommunicationsBadges = {};
  if (unreadChats > 0) badges.chats = unreadChats;
  return badges;
}
