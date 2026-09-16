import Image from 'next/image';
import type { RoleLoginPortal } from '@/modules/auth/roleLogin';

export function RoleLoginPortalHeader({
  portal,
  surfaceName,
  brandLogoUrl = null,
  brandedSurface = false,
}: {
  portal: RoleLoginPortal;
  surfaceName: string;
  /**
   * Знак арендатора с уже опознанной поверхности, ТОЛЬКО с публичной двери
   * (`anonymousBrandLogoUrl`): экран входа смотрят без сессии. `null` — знака нет, остаётся имя.
   */
  brandLogoUrl?: string | null;
  /** Поверхность клиники, а не общий TherapyGo: решает, чей знак показывать. */
  brandedSurface?: boolean;
}) {
  // Doctor-портал (вход после разлогина) — без верхней шапки, описательного блока и ссылки на
  // пациентский вход. Вертикальный лок-ап уменьшен на 30% и прижат к форме — владелец, 16.09.
  if (portal === 'doctor') {
    return (
      <div className="flex flex-col items-center">
        <Image
          src="/brand/therapysto-lockup-vertical.png"
          alt="Therapysto"
          width={92}
          height={91}
          priority
          unoptimized
        />
      </div>
    );
  }

  // Admin-портал — маленький знак над формой. Большой лок-ап и верхняя шапка сняты; дверь сразу
  // показывает email+пароль без выбора других способов (владелец, 16.09).
  if (portal === 'admin') {
    return (
      <div className="flex flex-col items-center">
        <Image
          src="/brand/admin-mark-transparent-source.png"
          alt="Therapysto Admin"
          width={48}
          height={42}
          priority
          unoptimized
        />
      </div>
    );
  }

  // Пациентский вход. Владелец 15.09 про прежнюю зелёную карточку с заголовком и описанием:
  // «Вырезать к черту. У обычного входа должен быть логотип терапиго, а у брендированных
  // приложений — их логотип и название организации». Поэтому здесь не текстовый блок, а знак:
  // на обычном входе — лок-ап TherapyGo (тот же файл, что в `TherapyGoLoginShell`), на домене
  // клиники — её логотип и её имя. Клиника без загруженного логотипа остаётся с именем: пустого
  // места на месте знака быть не должно. Ссылки «Открыть кабинет специалистов» здесь нет: владелец
  // 15.09 велел убрать и её — пациентский вход не предлагает уйти в чужой кабинет. Кабинет
  // специалистов живёт на своём хосте, и попадают туда по своему адресу.
  return (
    <div className="mt-2 flex flex-col items-center gap-3">
      {brandLogoUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- публичный адрес знака клиники,
              собранный сервером (`anonymousBrandLogoUrl`); экран входа анонимный, и сессионный
              `/api/media` сюда попасть не должен — 15.09 именно так и вышла битая картинка */}
          <img
            src={brandLogoUrl}
            alt=""
            className="size-16 rounded-2xl object-cover"
          />
          <p className="text-center text-base font-semibold text-foreground">{surfaceName}</p>
        </>
      ) : brandedSurface ? (
        <p className="text-center text-base font-semibold text-foreground">{surfaceName}</p>
      ) : (
        <Image
          src="/brand/therapygo-lockup-horizontal.png"
          alt="TherapyGo"
          width={817}
          height={302}
          sizes="260px"
          className="h-auto w-[200px]"
          priority
        />
      )}
    </div>
  );
}
