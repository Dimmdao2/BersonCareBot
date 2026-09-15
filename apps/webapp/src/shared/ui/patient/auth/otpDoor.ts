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
 * Что написать над полем кода. Формулировка владельца 16.09.2026, дословно: «код отправлен в
 * мессенджер, привязанный к вашему номеру».
 *
 * Она заменила прежнее «Код отправлен, проверьте входящие»: то не говорило ГДЕ искать, и владелец
 * 15.09 полчаса ждал сообщение, не зная, куда смотреть. И она одинакова для любого номера — экран
 * входа не должен по тексту выдавать, есть ли у нас такой человек.
 */
export function otpCodeDescription(channel: OtpDoorChannel): string {
  switch (channel) {
    case 'telegram':
      return 'Код отправлен в Telegram.';
    case 'max':
      return 'Код отправлен в Max.';
    case 'sms':
      return 'Код отправлен SMS на указанный номер.';
    case 'email':
      return 'Код отправлен на указанный адрес. Если письма нет, проверьте папку «Спам».';
    default:
      return 'Код отправлен в мессенджер, привязанный к вашему номеру.';
  }
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
