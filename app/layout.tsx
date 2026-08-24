import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL('https://brasta.app'),
  title: 'Brasta',
  description: 'Online Brasta card game',
  alternates: {
    canonical: '/',
  },
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
        <link rel="stylesheet" href="/connection-ui.css?v=0.5.17" />
        <link rel="stylesheet" href="/tutorial.css?v=0.5.14" />
        <link rel="stylesheet" href="/seat-picker.css?v=0.5.18" />
        <link rel="stylesheet" href="/dealer-marker.css?v=0.5.19" />
        <link rel="stylesheet" href="/build-owner-ui.css?v=0.5.20" />
        <link rel="stylesheet" href="/burn-callout.css?v=0.5.25" />
        <link rel="stylesheet" href="/account-ui.css?v=0.6.1" />
        <link rel="stylesheet" href="/account-nav.css?v=0.7.4" />
        <link rel="stylesheet" href="/competitive-ui.css?v=0.7.0" />
        <link rel="stylesheet" href="/product-surface.css?v=0.7.7" />
      </head>
      <body>
        {children}
        <Script src="/ranked-room-handoff-guard.js?v=0.7.1" strategy="beforeInteractive" />
        <Script src="/account-network.js?v=0.6.0" strategy="afterInteractive" />
        <Script src="/competitive-ui.js?v=0.7.5" strategy="afterInteractive" />
        <Script src="/competitive-account.js?v=0.7.0" strategy="afterInteractive" />
        <Script src="/ranked-match-transition.js?v=0.7.2" strategy="afterInteractive" />
        <Script src="/ranked-postmatch.js?v=0.7.3" strategy="afterInteractive" />
        <Script src="/lobby-polish.js?v=4" strategy="afterInteractive" />
        <Script src="/dist/bot.js?v=0.5.3" strategy="afterInteractive" />
        <Script src="/dist/compact.js?v=0.5.23" strategy="afterInteractive" />
        <Script src="/compact-ambiguity.js?v=0.5.22" strategy="afterInteractive" />
        <Script src="/connection-ui.js?v=0.5.17" strategy="afterInteractive" />
        <Script src="/network-stability-v2.js?v=0.5.17" strategy="afterInteractive" />
        <Script src="/seat-picker.js?v=0.5.18" strategy="afterInteractive" />
        <Script src="/dealer-marker.js?v=0.5.19" strategy="afterInteractive" />
        <Script src="/build-owner-ui.js?v=0.5.24" strategy="afterInteractive" />
        <Script src="/burn-callout.js?v=0.5.25" strategy="afterInteractive" />
        <Script src="/opening-order-fix.js?v=0.5.10" strategy="afterInteractive" />
        <Script src="/tutorial.js?v=0.5.14" strategy="afterInteractive" />
      </body>
    </html>
  );
}
