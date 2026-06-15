/**
 * Лёгкий общий загрузчик счётчиков-бейджей для таб-бара «Коммуникации»
 * (`DoctorCommunicationsTabsNav`). Каждая страница вкладки вызывает его, чтобы показать
 * непрочитанное по *другим* вкладкам (кросс-вкладочная синхронизация).
 *
 * Намеренно считает только дешёвые счётчики:
 * - `chats` — непрочитанные сообщения поддержки (`unreadFromUsers()`);
 * - `intake` — число новых онлайн-заявок (`listForDoctor({ status: "new" }).total`).
 *
 * `comments` сюда не входит: его источник (`loadDoctorExerciseCommentAttention`) обходит программы
 * всех клиентов на сопровождении и слишком тяжёл для вызова на каждой вкладке.
 *
 * Устойчив к сбоям: ошибка любого источника → 0; нулевые счётчики не попадают в результат
 * (бейдж не рисуется).
 */
import type { OnlineIntakeService } from "@/modules/online-intake/ports";
import type { CommunicationsTabId } from "./doctorCommunicationsTabs";

export type DoctorCommunicationsBadges = Partial<Record<CommunicationsTabId, number>>;

export type DoctorCommunicationsBadgesDeps = {
  messaging: {
    doctorSupport: {
      unreadFromUsers(): Promise<number>;
    };
  };
};

export async function loadDoctorCommunicationsBadges(
  deps: DoctorCommunicationsBadgesDeps,
  intakeService: Pick<OnlineIntakeService, "listForDoctor">,
): Promise<DoctorCommunicationsBadges> {
  const [unreadChats, newIntake] = await Promise.all([
    deps.messaging.doctorSupport.unreadFromUsers().catch(() => 0),
    intakeService
      .listForDoctor({ status: "new", limit: 1, offset: 0 })
      .then((r) => r.total)
      .catch(() => 0),
  ]);

  const badges: DoctorCommunicationsBadges = {};
  if (unreadChats > 0) badges.chats = unreadChats;
  if (newIntake > 0) badges.intake = newIntake;
  return badges;
}
