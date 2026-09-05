import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Cinzel } from 'next/font/google';
import type { ReactNode } from 'react';
import PresenceTracker from './PresenceTracker';
import './special-move-effects.css';

const brastaDisplay = Cinzel({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-brasta-display',
  weight: ['500', '600', '700', '800', '900'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://brasta.app'),
  title: 'Brasta',
  description: 'Online Brasta card game',
  applicationName: 'Brasta',
  alternates: {
    canonical: '/',
  },
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    title: 'Brasta',
    statusBarStyle: 'black-translucent',
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
    <html lang="en" className={brastaDisplay.variable}>
      <head>
        <meta name="brasta-realtime-url" content={process.env.NEXT_PUBLIC_BRASTA_REALTIME_URL || ''} />
        <link rel="stylesheet" href="/styles.css?v=0.4.10" />
        <link rel="stylesheet" href="/boot.css?v=0.4.10" />
        <link rel="stylesheet" href="/lobby-polish.css?v=5" />
        <link rel="stylesheet" href="/compact-gameplay.css?v=0.14.3" />
        <link rel="stylesheet" href="/connection-ui.css?v=0.5.17" />
        <link rel="stylesheet" href="/tutorial.css?v=0.5.14" />
        <link rel="stylesheet" href="/seat-picker.css?v=0.5.18" />
        <link rel="stylesheet" href="/dealer-marker.css?v=0.5.19" />
        <link rel="stylesheet" href="/build-owner-ui.css?v=0.5.21" />
        <link rel="stylesheet" href="/burn-callout.css?v=0.13.0" />
        <link rel="stylesheet" href="/account-ui.css?v=0.6.3" />
        <link rel="stylesheet" href="/account-nav.css?v=0.7.5" />
        <link rel="stylesheet" href="/friends-ui.css?v=0.1.5" />
        <link rel="stylesheet" href="/tournament-ui.css?v=0.1.3" />
        <link rel="stylesheet" href="/experience-ui.css?v=0.9.0" />
        <link rel="stylesheet" href="/competitive-ui.css?v=0.7.1" />
        <link rel="stylesheet" href="/ranked-timers.css?v=0.1.1" />
        <link rel="stylesheet" href="/competitive-account.css?v=0.8.1" />
        <link rel="stylesheet" href="/product-surface.css?v=0.8.2" />
        <link rel="stylesheet" href="/rank-badges.css?v=0.1.3" />
        <link rel="stylesheet" href="/ranked-wallpaper.css?v=0.9.5" />
        <link rel="stylesheet" href="/private-match-brand.css?v=0.8.3" />
        <link rel="stylesheet" href="/home-brand.css?v=0.7.13" />
        <link rel="stylesheet" href="/brand-polish.css?v=0.9.1" />
        <link rel="stylesheet" href="/learn-brasta-polish.css?v=0.19.1" />
        <link rel="stylesheet" href="/live-score-ui.css?v=0.15.4" />
        <link rel="stylesheet" href="/team-branding.css?v=0.15.5" />
        <link rel="stylesheet" href="/player-cards.css?v=0.1.6" />
        <link rel="stylesheet" href="/table-deck.css?v=0.1.1" />
        <link rel="stylesheet" href="/deal-animation.css?v=0.1.2" />
        <link rel="stylesheet" href="/player-profile.css?v=0.1.0" />
        <link rel="stylesheet" href="/player-progression.css?v=0.1.2" />
        <link rel="stylesheet" href="/achievement-filter.css?v=0.1.0" />
        <link rel="stylesheet" href="/stats-match-filter.css?v=0.2.0" />
        <link rel="stylesheet" href="/private-postmatch.css?v=0.16.0" />
        <link rel="stylesheet" href="/match-menu.css?v=0.13.0" />
        <link rel="stylesheet" href="/ranked-forfeit.css?v=0.11.0" />
        <link rel="stylesheet" href="/no-scroll-layout.css?v=0.1.14" />
        <link rel="stylesheet" href="/game-overlays.css?v=0.1.1" />
        <link rel="stylesheet" href="/emote-ui.css?v=0.1.3" />
        <link rel="stylesheet" href="/chat-ui.css?v=0.2.2" />
        <link rel="stylesheet" href="/mobile-game-header.css?v=0.1.6" />
        <link rel="stylesheet" href="/resume-match.css?v=0.1.0" />
      </head>
      <body>
        <PresenceTracker />
        {children}
        <Script src="/realtime-endpoint.js?v=0.12.0" strategy="beforeInteractive" />
        <Script src="/ranked-room-handoff-guard.js?v=0.7.1" strategy="beforeInteractive" />
        <Script src="/live-score-ui.js?v=0.15.4" strategy="beforeInteractive" />
        <Script src="/match-menu.js?v=0.13.0" strategy="beforeInteractive" />
        <Script src="/ranked-forfeit.js?v=0.12.0" strategy="beforeInteractive" />
        <Script src="/home-wordmark.js?v=0.7.14" strategy="afterInteractive" />
        <Script src="/rank-badges.js?v=0.1.2" strategy="afterInteractive" />
        <Script src="/player-profile.js?v=0.1.0" strategy="afterInteractive" />
        <Script src="/player-progression.js?v=0.1.2" strategy="afterInteractive" />
        <Script src="/achievement-filter.js?v=0.1.1" strategy="afterInteractive" />
        <Script src="/stats-match-filter.js?v=0.2.0" strategy="afterInteractive" />
        <Script src="/account-network.js?v=0.6.2" strategy="afterInteractive" />
        <Script src="/competitive-observer-guard.js?v=0.7.6" strategy="afterInteractive" />
        <Script src="/competitive-ui.js?v=0.7.8" strategy="afterInteractive" />
        <Script src="/competitive-2v2-ui.js?v=0.8.7" strategy="afterInteractive" />
        <Script src="/ranked-timers.js?v=0.1.2" strategy="afterInteractive" />
        <Script src="/competitive-account.js?v=0.8.1" strategy="afterInteractive" />
        <Script src="/ranked-match-transition.js?v=0.8.0" strategy="afterInteractive" />
        <Script src="/ranked-postmatch.js?v=0.8.0" strategy="afterInteractive" />
        <Script src="/private-postmatch.js?v=0.16.1" strategy="afterInteractive" />
        <Script src="/lobby-polish.js?v=13" strategy="afterInteractive" />
        <Script src="/hard-bot.js?v=0.18.1" strategy="afterInteractive" />
        <Script src="/bot-launcher-fix.js?v=0.19.0" strategy="afterInteractive" />
        <Script src="/dist/bot.js?v=0.5.5" strategy="afterInteractive" />
        <Script src="/team-branding.js?v=0.15.5" strategy="afterInteractive" />
        <Script src="/connection-ui.js?v=0.5.17" strategy="afterInteractive" />
        <Script src="/network-stability-v2.js?v=0.5.18" strategy="afterInteractive" />
        <Script src="/seat-picker.js?v=0.5.18" strategy="afterInteractive" />
        <Script src="/dealer-marker.js?v=0.5.20" strategy="afterInteractive" />
        <Script src="/deal-animation.js?v=0.1.2" strategy="afterInteractive" />
        <Script src="/build-owner-ui.js?v=0.5.26" strategy="afterInteractive" />
        <Script src="/burn-callout.js?v=0.13.5" strategy="afterInteractive" />
        <Script src="/opening-order-fix.js?v=0.5.10" strategy="afterInteractive" />
        <Script src="/no-scroll-layout.js?v=0.1.2" strategy="afterInteractive" />
        <Script src="/brasta-special-moves.js?v=0.6.0" strategy="afterInteractive" />
        <Script src="/game-overlays.js?v=0.1.0" strategy="afterInteractive" />
        <Script src="/emote-ui.js?v=0.1.4" strategy="afterInteractive" />
        <Script src="/chat-ui.js?v=0.2.3" strategy="afterInteractive" />
        <Script src="/mobile-game-header.js?v=0.1.5" strategy="afterInteractive" />
        <Script src="/tutorial.js?v=0.6.0" strategy="afterInteractive" />
      </body>
    </html>
  );
}
