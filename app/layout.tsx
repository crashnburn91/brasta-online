import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Brasta',
  description: 'Online Brasta card game',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#071b13',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/styles.css?v=0.4.10" />
        <link rel="stylesheet" href="/boot.css?v=0.4.10" />
        <link rel="stylesheet" href="/lobby-polish.css?v=3" />
      </head>
      <body>
        {children}
        <Script src="/lobby-polish.js?v=3" strategy="afterInteractive" />
      </body>
    </html>
  );
}
