import { hasMessengerBinding } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import type { AppSession } from "@/shared/types/session";
import { GuestPlaceholder } from "@/shared/ui/GuestPlaceholder";

/** Блок для «Мои записи» без сессии или без телефона (EXEC I.10). Без inline-формы телефона. */
export function CabinetGuestAccess({ session }: { session: AppSession | null }) {
  if (!session) {
    return (
      <GuestPlaceholder
        title="Мои записи"
        description="Здесь отображаются ваши записи на приём и их история. Записаться можно без регистрации; чтобы видеть свои записи в списке — войдите и подтвердите номер телефона."
        actionLabel="Записаться на приём"
        actionHref={routePaths.patientBooking}
        secondaryLabel="Войти"
        secondaryHref={`${routePaths.root}?next=${encodeURIComponent(routePaths.cabinet)}`}
      />
    );
  }
  return (
    <GuestPlaceholder
      title="Мои записи"
      description="Здесь отображаются ваши записи на приём и их история. Чтобы видеть список, нужен подтверждённый номер или подключённый мессенджер."
      actionLabel="Записаться на приём"
      actionHref={routePaths.patientBooking}
      secondaryLabel="Подтвердить номер"
      secondaryHref={`${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.cabinet)}`}
    />
  );
}

/** Подтверждённый телефон или мессенджер (без type predicate — иначе TS сужает ветку «гостя» до `null`). */
export function patientHasPhoneOrMessenger(session: AppSession): boolean {
  return Boolean(session.user.phone?.trim() || hasMessengerBinding(session));
}

type DiaryGateProps = {
  session: AppSession | null;
  /** Куда вернуться после входа / привязки. */
  returnTo: string;
  title?: string;
};

/** Дневник и журналы: без сессии или без телефона — заглушка, без формы телефона на странице (EXEC I.10). */
export function DiarySectionGuestAccess({
  session,
  returnTo,
  title = "Дневник",
}: DiaryGateProps) {
  if (session && patientHasPhoneOrMessenger(session)) return null;
  const next = encodeURIComponent(returnTo);
  if (!session) {
    return (
      <GuestPlaceholder
        title={title}
        description="Дневники помогают отслеживать симптомы и занятия ЛФК. Войдите или зарегистрируйтесь, чтобы вести дневник в приложении."
        actionLabel="Зарегистрироваться"
        actionHref={`${routePaths.root}?next=${next}`}
      />
    );
  }
  return (
    <GuestPlaceholder
      title={title}
      description="Для сохранения записей дневника подтвердите номер телефона или подключите мессенджер в профиле."
      actionLabel="Подтвердить номер"
      actionHref={`${routePaths.bindPhone}?next=${next}`}
    />
  );
}

export function PurchasesGuestAccess({ session }: { session: AppSession | null }) {
  if (session && patientHasPhoneOrMessenger(session)) return null;
  const next = encodeURIComponent(routePaths.purchases);
  if (!session) {
    return (
      <GuestPlaceholder
        title="Мои покупки"
        description="Раздел доступен после входа в аккаунт."
        actionLabel="Зарегистрироваться"
        actionHref={`${routePaths.root}?next=${next}`}
      />
    );
  }
  return (
    <GuestPlaceholder
      title="Мои покупки"
      description="Чтобы видеть покупки и доступы, подтвердите номер телефона или подключите мессенджер."
      actionLabel="Подтвердить номер"
      actionHref={`${routePaths.bindPhone}?next=${next}`}
    />
  );
}

export function NotificationsGuestAccess({ session }: { session: AppSession | null }) {
  if (session && patientHasPhoneOrMessenger(session)) return null;
  const next = encodeURIComponent(routePaths.notifications);
  if (!session) {
    return (
      <GuestPlaceholder
        title="Подписки на уведомления"
        description="Настройка уведомлений доступна после входа в аккаунт."
        actionLabel="Зарегистрироваться"
        actionHref={`${routePaths.root}?next=${next}`}
      />
    );
  }
  return (
    <GuestPlaceholder
      title="Подписки на уведомления"
      description="Чтобы настроить каналы уведомлений, подтвердите номер телефона или подключите мессенджер в профиле."
      actionLabel="Подтвердить номер"
      actionHref={`${routePaths.bindPhone}?next=${next}`}
    />
  );
}
