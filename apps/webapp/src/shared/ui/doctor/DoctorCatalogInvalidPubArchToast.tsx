'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { explicitDoctorCatalogPubArchParamsInvalid } from '@/shared/lib/doctorCatalogListStatus';
import { notificationText } from '@/shared/notifications/notificationText';

/**
 * B1 UX: при заведомо невалидных `arch` / `pub` в URL — одноразовый toast (тихий fallback парсера сохраняется).
 */
export function DoctorCatalogInvalidPubArchToast() {
  const searchParams = useSearchParams();
  const arch = searchParams.get('arch');
  const pub = searchParams.get('pub');
  const toastedKey = useRef<string | null>(null);

  useEffect(() => {
    if (
      !explicitDoctorCatalogPubArchParamsInvalid({ arch: arch ?? undefined, pub: pub ?? undefined })
    ) {
      return;
    }
    const key = `${arch ?? ''}\0${pub ?? ''}`;
    if (toastedKey.current === key) return;
    toastedKey.current = key;
    toast.error(
      notificationText.doctorArchivePublishParamsInvalid,
    );
  }, [arch, pub]);

  return null;
}
