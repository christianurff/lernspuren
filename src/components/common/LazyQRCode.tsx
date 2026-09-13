import { Suspense, lazy } from 'react';

// qrcode.react wird nur in den Teilen-Dialogen gebraucht und darum erst dann
// nachgeladen (hält den Start-Chunk klein).
const QRCodeSVG = lazy(async () => {
  const module = await import('qrcode.react');
  return { default: module.QRCodeSVG };
});

interface LazyQRCodeProps {
  value: string;
  size?: number;
}

/** QR-Code mit Platzhalter in gleicher Größe, solange die Bibliothek lädt. */
export function LazyQRCode({ value, size = 200 }: LazyQRCodeProps) {
  return (
    <Suspense fallback={<div style={{ width: size, height: size }} className="rounded-xl bg-black/5 animate-pulse" />}>
      <QRCodeSVG value={value} size={size} level="M" includeMargin={false} />
    </Suspense>
  );
}
