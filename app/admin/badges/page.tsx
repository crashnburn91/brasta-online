import type { Metadata } from 'next';
import BadgeAdminClient from './BadgeAdminClient';
import './badge-admin.css';

export const metadata: Metadata = {
  title: 'Profile Badges · Brasta Admin',
  robots: { index: false, follow: false },
};

export default function BadgeAdminPage() {
  return <BadgeAdminClient />;
}
