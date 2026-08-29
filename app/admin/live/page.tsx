import type { Metadata } from 'next';
import LiveTrafficClient from './LiveTrafficClient';
import './live-traffic.css';

export const metadata: Metadata = {
  title: 'Live Traffic · Brasta Admin',
  robots: { index: false, follow: false },
};

export default function LiveTrafficPage() {
  return <LiveTrafficClient />;
}
