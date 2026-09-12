'use client';

import toast from 'react-hot-toast';
import { notificationText } from '@/shared/notifications/notificationText';

/**
 * Share `/app/patient` URL: Web Share API when available, otherwise clipboard + toast.
 */
export async function shareCabinetLink(): Promise<void> {
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/app/patient`;
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await navigator.share({ url });
      return;
    } catch {
      /* fallback to clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success(notificationText.ssylkaSkopirovana);
  } catch {
    toast.error(notificationText.neUdalosSkopirovatSsylku);
  }
}
