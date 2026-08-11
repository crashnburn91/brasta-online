import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Brasta',
  description: 'Online Brasta card game',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#071b13" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        {children}
        <script src="/dist/game.js" defer />
        <script src="/dist/network.js" defer />
        <script src="/dist/app.js" defer />
      </body>
    </html>
  );
}
