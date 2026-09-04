import type { Metadata } from 'next';
import '../legal.css';

export const metadata: Metadata = { title: 'Terms of Service · Brasta' };

const supportEmail = process.env.NEXT_PUBLIC_BRASTA_SUPPORT_EMAIL || 'support@brasta.app';

export default function TermsPage() {
  return (
    <main className="legal-shell"><div className="legal-wrap">
      <nav className="legal-nav"><a href="/">Brasta</a><a href="/privacy">Privacy</a><a href="/community-guidelines">Community Guidelines</a><a href="/support">Support</a></nav>
      <div className="legal-eyebrow">BRASTA LEGAL</div><h1>Terms of Service</h1><p className="legal-updated">Effective September 1, 2026</p>
      <article className="legal-card">
        <h2>Using Brasta</h2><p>These Terms govern your access to Brasta. You may play private games as a guest, but accounts are required for competitive features and posting, reporting, or blocking in match chat. You must provide accurate information, protect your account, and meet the minimum age required by the Community Guidelines and local law.</p>
        <h2>Acceptable use</h2><p>You may not interfere with the service, exploit bugs, automate play without permission, manipulate matches or ratings, evade restrictions, access another user’s account, or use Brasta for unlawful activity. Match chat is also governed by the <a href="/community-guidelines">Community Guidelines</a>.</p>
        <h2>Your content</h2><p>You keep ownership of content you submit. You grant Brasta a limited, worldwide license to host, transmit, display, and moderate that content solely to operate, secure, and improve the service. Do not submit content you do not have the right to share.</p>
        <h2>Moderation</h2><p>Brasta may filter or reject content, preserve report snapshots, remove messages, and apply warnings, mutes, suspensions, or bans to protect players and enforce these Terms. Serious or repeated violations may result in account restrictions or termination.</p>
        <h2>Account deletion</h2><p>You may permanently delete your account from the Brasta account panel. Deletion cannot be undone and removes access to profile, social, competitive, and chat data associated with the account, subject to limited legal and backup retention described in the Privacy Policy.</p>
        <h2>Service availability</h2><p>Brasta is provided on an “as available” basis. Features may change, pause, or end. To the extent permitted by law, Brasta is not liable for indirect or consequential loss arising from use of the service.</p>
        <h2>Contact</h2><a className="legal-contact" href={`mailto:${supportEmail}?subject=Brasta%20Terms`}>{supportEmail}</a>
      </article>
    </div></main>
  );
}
