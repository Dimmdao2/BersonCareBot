'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import Image from 'next/image';

type Props = {
  url: string;
};

/** QR is an image data URI: it cannot execute a payload from the payment URL in the page DOM. */
export function PaymentLinkQrCode({ url }: Props) {
  const [dataUri, setDataUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })
      .then((svg) => {
        if (active) setDataUri(`data:image/svg+xml,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (active) setDataUri(null);
      });
    return () => {
      active = false;
    };
  }, [url]);

  if (!dataUri) return null;

  return (
    <Image
      alt="QR-код платёжной ссылки"
      className="mx-auto h-auto w-full max-w-72"
      height={288}
      src={dataUri}
      unoptimized
      width={288}
    />
  );
}
