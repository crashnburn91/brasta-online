import type { Metadata } from 'next';
import '../legal.css';

export const metadata: Metadata = { title: 'Privacy Policy · Brasta' };

const supportEmail = process.env.NEXT_PUBLIC_BRASTA_SUPPORT_EMAIL || 'support@brasta.app';

export default function PrivacyPage() {
  return (
    <main className="legal-shell"><div className="legal-wrap">
      <nav className="legal-nav"><a href="/">Brasta</a><a href="/terms">Terms</a><a href="/community-guidelines">Community Guidelines</a><a href="/support">Support</a></nav>
      <div className="legal-eyebrow">BRASTA PRIVACY</div><h1>Privacy Policy</h1><p className="legal-updated">Effective September 1, 2026</p>
      <article className="legal-card">
        <h2>Information we collect</h2>
        <ul><li><b>Account data:</b> account identifier, email address, linked sign-in provider, username, display name, and profile picture.</li><li><b>Game data:</b> room participation, match results, ratings, experience, tournament participation, friends, blocks, and invitations.</li><li><b>Chat and safety data:</b> accepted chat messages, chat-policy consent, reports, report message snapshots, moderation actions, and hash-only records of rejected content attempts.</li><li><b>Technical data:</b> connection, reliability, presence, and security information needed to operate and protect the service.</li></ul>
        <h2>How we use information</h2><p>We use information to authenticate accounts, run games and competitive features, deliver social features, display profile pictures, prevent fraud and abuse, enforce the Community Guidelines, respond to reports, provide support, and maintain service reliability.</p>
        <h2>Sharing and service providers</h2><p>We share information only with infrastructure, authentication, database, realtime, email, and hosting providers that process it for Brasta, when you direct us to share it, or when required by law. Social sign-in providers receive information as described by their own privacy notices. We do not sell personal information or use match-chat content for advertising.</p>
        <h2>Retention</h2><ul><li>Accepted chat messages and active room memberships are automatically deleted after 30 days.</li><li>Hash-only rejected-content safety events are automatically deleted after 180 days.</li><li>Reports and moderation actions are retained while needed for safety, appeals, legal obligations, and abuse prevention.</li><li>Account and gameplay data is retained while your account is active, subject to operational backups and legal requirements.</li></ul>
        <h2>Your controls</h2><p>You can block players in chat, manage connected accounts, and permanently delete your Brasta account from the account panel. Account deletion removes the authentication account and associated profile, social, competitive, and chat records from active systems. You may also contact us to request access or correction where applicable.</p>
        <h2>Children</h2><p>Brasta accounts and chat are not intended for children under 13 or below the minimum digital-consent age in their country. If you believe a child provided personal information, contact us so we can investigate and delete it.</p>
        <h2>Security and changes</h2><p>We use access controls, encrypted transport, least-privilege database policies, rate limits, and audit records to protect information. No system is perfectly secure. We may update this policy and will publish the effective date here.</p>
        <h2>Contact</h2><a className="legal-contact" href={`mailto:${supportEmail}?subject=Brasta%20Privacy`}>{supportEmail}</a>
      </article>
    </div></main>
  );
}
