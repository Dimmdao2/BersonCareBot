import type { ClientIdentity } from "@/modules/doctor-clients/ports";
import { doctorInlineLinkClass } from "@/shared/ui/doctor/doctorVisual";
import { phoneToTelHref } from "@/shared/lib/phoneLinks";

type Props = {
  identity: Pick<ClientIdentity, "phone" | "email" | "emailVerifiedAt">;
};

/** Primary account contacts from `platform_users` (not supplementary / not delivery channels). */
export function DoctorClientPrimaryContacts({ identity }: Props) {
  const tel = phoneToTelHref(identity.phone);
  const email = identity.email?.trim() ?? "";
  const emailVerified = Boolean(identity.emailVerifiedAt);

  return (
    <div id="doctor-client-primary-contacts" className="flex flex-col gap-1 text-sm">
      {identity.phone ? (
        <p>
          Телефон:{" "}
          {tel ? (
            <a href={tel} className={doctorInlineLinkClass}>
              {identity.phone}
            </a>
          ) : (
            <span className="font-medium">{identity.phone}</span>
          )}
        </p>
      ) : (
        <p className="text-muted-foreground">Телефон не указан</p>
      )}
      {email ? (
        <p>
          Email:{" "}
          <a href={`mailto:${email}`} className={doctorInlineLinkClass}>
            {email}
          </a>
          <span className="text-muted-foreground">
            {emailVerified ? " · подтверждён" : " · не подтверждён"}
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground">Email не указан</p>
      )}
    </div>
  );
}
