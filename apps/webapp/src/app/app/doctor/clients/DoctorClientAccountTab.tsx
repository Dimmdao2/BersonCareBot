'use client';

import type { ClientProfile } from '@/modules/doctor-clients/service';
import { DoctorClientPrimaryContacts } from './DoctorClientPrimaryContacts';
import { DoctorLfkComplexExerciseOverridesPanel } from './DoctorLfkComplexExerciseOverridesPanel';
import { DoctorSupplementaryContactsPanel } from './DoctorSupplementaryContactsPanel';
import { DoctorClientLifecycleActions } from './DoctorClientLifecycleActions';
import { SubscriberBlockPanel } from './SubscriberBlockPanel';
import { DoctorClientSupportPanel } from './DoctorClientSupportPanel';
import type { LfkComplexExerciseLine } from '@/modules/diaries/types';
import { doctorClientTabSectionClass } from './doctorClientCardChrome';

type Props = {
  profile: ClientProfile;
  userId: string;
  canEditClientProfile: boolean;
  lfkExerciseLinesByComplexId: Record<string, LfkComplexExerciseLine[]>;
};

export function DoctorClientAccountTab({
  profile,
  userId,
  lfkExerciseLinesByComplexId,
}: Props) {
  const { identity, channelCards, supplementaryContacts, lfkComplexes, recentLfkSessions } =
    profile;

  return (
    <div className="flex flex-col gap-0">
      <section id="doctor-client-section-contacts" className={doctorClientTabSectionClass}>
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-foreground">Контакты и каналы</p>
          <DoctorClientPrimaryContacts identity={identity} />
          <DoctorSupplementaryContactsPanel
            userId={userId}
            initialContacts={supplementaryContacts}
          />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Каналы доставки
          </p>
          <ul id="doctor-client-channels-list" className="m-0 list-none p-0">
            {channelCards.map((ch) => (
              <li key={ch.code} id={`doctor-client-channel-item-${ch.code}`}>
                {ch.title}
                {ch.isLinked ? ' · подключён' : ' · не подключён'}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={doctorClientTabSectionClass}>
        <DoctorClientSupportPanel patientUserId={userId} />
      </section>

      <section id="doctor-client-section-lfk" className={doctorClientTabSectionClass}>
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
            ЛФК (legacy)
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {lfkComplexes.length === 0 ? (
              <p className="text-muted-foreground">Нет комплексов ЛФК.</p>
            ) : (
              <>
                <p className="text-sm">Комплексы: {lfkComplexes.map((c) => c.title).join(', ')}</p>
                {recentLfkSessions.length > 0 ? (
                  <p className="text-sm">Последние занятия: {recentLfkSessions.length}</p>
                ) : null}
              </>
            )}
            <DoctorLfkComplexExerciseOverridesPanel
              patientUserId={userId}
              complexes={lfkComplexes}
              linesByComplexId={lfkExerciseLinesByComplexId}
            />
          </div>
        </details>
      </section>

      <section id="doctor-client-section-lifecycle" className={doctorClientTabSectionClass}>
        <DoctorClientLifecycleActions userId={userId} isArchived={identity.isArchived} />
      </section>

      <section id="doctor-client-section-subscriber" className={doctorClientTabSectionClass}>
        <SubscriberBlockPanel
          userId={userId}
          initiallyBlocked={identity.isBlocked}
          blockedReason={identity.blockedReason}
        />
      </section>
    </div>
  );
}
