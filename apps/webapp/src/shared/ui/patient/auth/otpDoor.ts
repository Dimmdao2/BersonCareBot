import {
  OTP_OTHER_CHANNELS_ORDER,
  OTP_PUBLIC_OTHER_CHANNELS_ORDER,
  isOtpChannelAvailablePublic,
  type AuthChannelUiPolicy,
  type OtpUiChannel,
} from '@/modules/auth/otpChannelUi';
import type { AuthMethodsPayload } from '@/modules/auth/checkPhoneMethods';
import type { OtpAlternativeEntry } from '@/shared/ui/patient/auth/OtpCodeForm';

/** Канал доставки на экране кода; `automatic` — канал выбрал сервер, а не человек. */
export type OtpDoorChannel = 'automatic' | OtpUiChannel;

/**
 * ДВЕРЬ ВХОДА ПО НОМЕРУ: что написать над полем кода.
 *
 * Ни одна ветка не утверждает доставку. `/api/auth/phone/start` отвечает одинаково на любой номер —
 * иначе по ответу читалось бы, есть ли у нас такой человек, — а при включённом, но ненастроенном
 * канале код не уходит вовсе. Владелец 15.09.2026 полчаса ждал сообщение, которого никто не слал:
 * экран сказал «Код отправлен, проверьте входящие», а имя телеграм-бота в настройках было пустым.
 * Условная форма («если этот номер у нас есть») сохраняет нейтральность: она одинакова для чужого
 * и своего номера и потому ничего о номере не сообщает.
 */
export function phoneLoginOtpDescription(channel: OtpDoorChannel): string {
  switch (channel) {
    case 'telegram':
      return 'Если этот номер у нас есть, код уже в боте Telegram.';
    case 'max':
      return 'Если этот номер у нас есть, код уже в боте Max.';
    case 'sms':
      return 'Если этот номер у нас есть, код придёт SMS на него.';
    case 'email':
      return 'Если этот адрес у нас есть, код отправлен на него.';
    default:
      return 'Если этот номер у нас есть, код уже пришёл в ваш бот — Telegram или Max.';
  }
}

/**
 * ПРИВЯЗКА СВОЕГО НОМЕРА вошедшим человеком: скрывать тут нечего, номер он назвал сам и отказ ему
 * показывают как отказ, — поэтому отправку можно утверждать прямо.
 */
export function phoneBindOtpDescription(channel: OtpDoorChannel): string {
  if (channel === 'sms') return 'Код отправлен SMS на указанный номер.';
  if (channel === 'max') return 'Код отправлен в Max — откройте чат с ботом.';
  return 'Код отправлен в Telegram — откройте чат с ботом.';
}

const CHANNEL_RESEND_LABEL: Readonly<Record<OtpUiChannel, string>> = {
  telegram: 'Получить код в Telegram',
  max: 'Получить код в Max',
  sms: 'Получить код по SMS',
  email: 'Войти по email',
};

/**
 * ЧЕМ ЕЩЁ ПОДТВЕРДИТЬ ВХОД ПО НОМЕРУ.
 *
 * Правило владельца 16.09.2026: «по телефону можно отправлять только в ботов, то есть в макс или
 * телеграм. По имейл — надо ввести имейл». Боты и SMS — это повторная отправка ПО ТОМУ ЖЕ номеру,
 * а почта — переход на свою дверь, где адрес называет сам человек.
 *
 * Почему почту нельзя оставлять здесь кнопкой «отправить»: адрес брался у аккаунта, найденного по
 * введённому номеру. Опечатка в номере — и код уходил постороннему, человек ждал письмо, которого
 * ему никто не слал, и сменить способ входа уже не мог. Владелец: «эти попытки полностью
 * самостоятельны». Сервер отказывает так же (`deliveryChannel: 'email'` на публичном входе).
 */
export function buildPublicPhoneOtpAlternatives(
  methods: AuthMethodsPayload,
  currentChannel: OtpDoorChannel,
  onResend: (channel: OtpUiChannel) => unknown,
  onEmailDoor: (() => void) | null,
): OtpAlternativeEntry[] {
  const result: OtpAlternativeEntry[] = [];
  for (const channel of OTP_PUBLIC_OTHER_CHANNELS_ORDER) {
    if (channel === currentChannel) continue;
    if (!isOtpChannelAvailablePublic(methods, channel)) continue;
    if (channel === 'email') {
      if (!onEmailDoor) continue;
      result.push({ label: CHANNEL_RESEND_LABEL.email, onClick: () => onEmailDoor() });
      continue;
    }
    result.push({
      label: CHANNEL_RESEND_LABEL[channel],
      onClick: async () => {
        await onResend(channel);
      },
    });
  }
  return result;
}

/** То же правило на мессенджерном экране входа: почты в списке нет, её дверь отдельная. */
export function buildPhoneMessengerOtpAlternatives(
  channelPolicy: AuthChannelUiPolicy,
  onResend: (channel: OtpUiChannel) => unknown,
): OtpAlternativeEntry[] {
  return OTP_OTHER_CHANNELS_ORDER.filter(
    (channel) => channel !== 'email' && channelPolicy[channel],
  ).map((channel) => ({
    label: CHANNEL_RESEND_LABEL[channel],
    onClick: async () => {
      await onResend(channel);
    },
  }));
}
