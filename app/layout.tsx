import type { Metadata, Viewport } from 'next';
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
        <link rel="stylesheet" href="/styles.css?v=0.4.5" />
      </head>
      <body>
        {children}
        <script src="/boot-diagnostics.js?v=0.4.5" />
        <script src="/dist/game.js?v=0.4.5" defer />
        <script src="/dist/network.js?v=0.4.5" defer />
        <script src="/dist/app.js?v=0.4.5" defer />
      </body>
    </html>
  );
}
