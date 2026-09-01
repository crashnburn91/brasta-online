import type { Metadata } from 'next';
import ModerationAdminClient from './ModerationAdminClient';
import './moderation-admin.css';

export const metadata: Metadata = {
  title: 'Chat Moderation · Brasta Admin',
  robots: { index: false, follow: false },
};

export default function ModerationAdminPage() {
  return <ModerationAdminClient />;
}
