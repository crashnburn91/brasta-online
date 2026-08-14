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
        <link rel="stylesheet" href="/lobby-polish.css?v=4" />
        <link rel="stylesheet" href="/compact-gameplay.css?v=0.5.4" />
        <link rel="stylesheet" href="/connection-ui.css?v=0.5.5" />
      </head>
      <body>
        {children}
        <Script src="/lobby-polish.js?v=4" strategy="afterInteractive" />
        <Script src="/dist/bot.js?v=0.5.3" strategy="afterInteractive" />
        <Script src="/dist/compact.js?v=0.5.4" strategy="afterInteractive" />
        <Script src="/compact-ambiguity.js?v=0.5.6" strategy="afterInteractive" />
        <Script src="/connection-ui.js?v=0.5.5" strategy="afterInteractive" />
      </body>
    </html>
  );
}
