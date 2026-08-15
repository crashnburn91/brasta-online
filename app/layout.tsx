import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Brasta — A Romani-American Card Game',
  description: 'Brasta is a Romani-American card game of builds, captures and sweeps — from family tables to the online table.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#351014',
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
        <link rel="stylesheet" href="/tutorial.css?v=0.5.14" />
        <link rel="stylesheet" href="/brand-heritage.css?v=2" />
      </head>
      <body>
        {children}
        <Script src="/lobby-polish.js?v=4" strategy="afterInteractive" />
        <Script src="/dist/bot.js?v=0.5.3" strategy="afterInteractive" />
        <Script src="/dist/compact.js?v=0.5.4" strategy="afterInteractive" />
        <Script src="/compact-ambiguity.js?v=0.5.6" strategy="afterInteractive" />
        <Script src="/connection-ui.js?v=0.5.5" strategy="afterInteractive" />
        <Script src="/opening-order-fix.js?v=0.5.10" strategy="afterInteractive" />
        <Script src="/scoring-tie-fix.js?v=0.5.12" strategy="afterInteractive" />
        <Script src="/tutorial.js?v=0.5.14" strategy="afterInteractive" />
        <Script src="/brand-heritage.js?v=2" strategy="afterInteractive" />
      </body>
    </html>
  );
}
