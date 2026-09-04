import type { Metadata } from 'next';
import '../legal.css';

export const metadata: Metadata = { title: 'Support · Brasta' };

const supportEmail = process.env.NEXT_PUBLIC_BRASTA_SUPPORT_EMAIL || 'support@brasta.app';

export default function SupportPage() {
  return (
    <main className="legal-shell"><div className="legal-wrap">
      <nav className="legal-nav"><a href="/">Brasta</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/community-guidelines">Community Guidelines</a></nav>
      <div className="legal-eyebrow">BRASTA HELP</div><h1>Support &amp; Safety</h1><p className="legal-updated">Player support and published contact information</p>
      <article className="legal-card">
        <h2>Chat safety</h2><p>For the fastest moderation review, open Match Chat, use the three-dot safety button on the message, and choose Submit Report. The report securely includes the message snapshot and context needed for review. You can block the player from the same screen.</p>
        <h2>Urgent safety concerns</h2><p>Safety reports are prioritized. If there is an immediate real-world danger, contact local emergency services first, then email Brasta with the room code, player username, and approximate time.</p>
        <h2>Account and privacy help</h2><p>You can permanently delete your account in Brasta: open your account, expand “Delete Brasta account,” and type DELETE. For privacy, sign-in, deletion, or moderation questions, contact support.</p>
        <a className="legal-contact" href={`mailto:${supportEmail}?subject=Brasta%20Support`}>{supportEmail}</a>
      </article>
    </div></main>
  );
}
