import SeasonPassPreview from './SeasonPassPreview';
import './season-pass.css';

export const metadata = { title: 'Season 1 · Brasta', robots: { index: false, follow: false } };

export default function SeasonPassPage() {
  return <SeasonPassPreview />;
}
