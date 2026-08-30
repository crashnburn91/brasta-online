import type { Metadata } from 'next';
import TournamentAdminClient from './TournamentAdminClient';
import './tournaments-admin.css';

export const metadata: Metadata = {
  title: 'Tournaments · Brasta Admin',
  robots: { index: false, follow: false },
};

export default function TournamentAdminPage() {
  return <TournamentAdminClient />;
}
