/**
 * Which bot the phone-confirmation deep link opens.
 *
 * Owner 20.08 («клиника с механикой брендирования — свой бот; клиника без неё — общий Therapysto»)
 * + owner 23.08 («обычный Therapysto-бот делает и привязку телефона»). One selector, one shape,
 * parameterised by channel: Telegram and MAX differ only in the handle format their adapter needs,
 * not in the rule.
 *
 * The bot only PROVES ownership of the phone and delivers the code — it never opens an account
 * (owner 23.08). Nothing here creates or resolves a person; it returns a public handle.
 */
import type { ResolvedSurface } from '@/shared/lib/surface/requestSurface';
import type { PhoneMessengerBindChannel } from './phoneMessengerBind.ports';

export type MessengerBindBotIdentity =
  | Readonly<{ kind: 'platform'; publicId: string }>
  | Readonly<{ kind: 'clinic'; publicId: string; organizationId: string }>;

export type MessengerBindBotIdentityResult =
  | Readonly<{ ok: true; identity: MessengerBindBotIdentity }>
  /** The clinic declared its own bot and it is not usable. No silent platform fallback. */
  | Readonly<{ ok: false; error: 'clinic_bot_unavailable' }>;

export function selectMessengerBindBotIdentity(input: {
  surface: ResolvedSurface | null;
  channelCode: PhoneMessengerBindChannel;
  /** Common Therapysto handle for the channel, already normalized by its settings accessor. */
  platformPublicId: string;
}): MessengerBindBotIdentityResult {
  const platformPublicId = input.platformPublicId.trim();
  const clinicBot =
    input.surface?.surface === 'patient_branded'
      ? input.surface.clinicMessengerBots?.[input.channelCode]
      : undefined;

  if (clinicBot) {
    if (clinicBot.status !== 'ready' || !input.surface?.organizationId) {
      return { ok: false, error: 'clinic_bot_unavailable' };
    }
    return {
      ok: true,
      identity: {
        kind: 'clinic',
        publicId: clinicBot.publicId,
        organizationId: input.surface.organizationId,
      },
    };
  }

  // No clinic bot declared for this platform → the common Therapysto bot, exactly as before.
  return { ok: true, identity: { kind: 'platform', publicId: platformPublicId } };
}
