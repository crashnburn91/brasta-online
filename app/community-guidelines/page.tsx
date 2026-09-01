import type { Metadata } from 'next';
import '../legal.css';

export const metadata: Metadata = { title: 'Community Guidelines · Brasta' };

const supportEmail = process.env.NEXT_PUBLIC_BRASTA_SUPPORT_EMAIL || 'support@brasta.app';

export default function CommunityGuidelinesPage() {
  return (
    <main className="legal-shell"><div className="legal-wrap">
      <nav className="legal-nav"><a href="/">Brasta</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/support">Support</a></nav>
      <div className="legal-eyebrow">BRASTA SAFETY</div><h1>Community Guidelines</h1><p className="legal-updated">Effective September 1, 2026</p>
      <article className="legal-card">
        <h2>Play hard. Treat people well.</h2>
        <p>Brasta match chat is for friendly table talk, strategy, and sportsmanship. By enabling chat, you agree to these rules and to the Brasta Terms.</p>
        <div className="legal-callout"><p>Chat posting requires a signed-in account. Guests and spectators may read chat. Signed-in spectators can also report and block players.</p></div>
        <h2>Not allowed</h2>
        <ul><li>Harassment, bullying, targeted insults, stalking, or encouraging self-harm.</li><li>Hate speech, slurs, or discrimination based on protected characteristics.</li><li>Threats, glorification of violence, or instructions for wrongdoing.</li><li>Sexual content, sexual solicitation, pornography, or exploitation.</li><li>Profanity, spam, scams, impersonation, cheating coordination, or match manipulation.</li><li>Sharing links, phone numbers, email addresses, IP addresses, or other personal contact information.</li><li>Any illegal content or content that violates another person’s privacy or rights.</li></ul>
        <h2>Filters and enforcement</h2>
        <p>Brasta automatically rejects common prohibited language and personal contact details before they are posted. Attempts may create a non-reversible content hash and safety reason for abuse prevention; rejected text is not stored as a readable message.</p>
        <p>Moderators may remove messages and issue warnings, temporary mutes, suspensions, or permanent chat bans. Repeated or serious violations may result in account restrictions.</p>
        <h2>Report and block</h2>
        <p>Use the three-dot safety button on another player’s message to submit a report or block that player. Reports include a snapshot of the reported message so moderators can review it. Blocking immediately hides the player’s messages and removes any friendship between the accounts.</p>
        <h2>Age and safety</h2>
        <p>You must be at least 13 years old and meet the minimum digital-consent age where you live to create an account or post chat. Do not share personal contact details in match chat.</p>
        <h2>Contact</h2><p>For a safety concern that cannot be reported in chat, contact the Brasta safety team.</p><a className="legal-contact" href={`mailto:${supportEmail}?subject=Brasta%20Safety`}>{supportEmail}</a>
      </article>
    </div></main>
  );
}
