import Image from 'next/image';
import type { SeasonReward } from '../../lib/season-catalog';

const dimensions: Record<SeasonReward['kind'], [number, number]> = {
  'Card back': [300, 420],
  'Card faces': [300, 420],
  Badge: [240, 240],
  'Avatar frame': [300, 300],
  'Table felt': [600, 360],
  Title: [420, 120],
};

export default function RewardArtwork({ reward, eager = false }: { reward: SeasonReward; eager?: boolean }) {
  if (reward.id === 'golden_wagon') {
    return <div aria-hidden="true" className="sp-art sp-deep-red sp-art-card-back">
      <svg className="sp-wagon-wheel" viewBox="0 0 100 100" focusable="false">
        <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {Array.from({ length: 12 }, (_, i) => <path key={i} d="M47.5 40 L48.5 15 L51.5 15 L52.5 40 Z" fill="currentColor" transform={`rotate(${i * 30} 50 50)`} />)}
        <circle cx="50" cy="50" r="10" fill="currentColor" />
        <circle cx="50" cy="50" r="4" fill="#650f20" stroke="#f0d58a" strokeWidth="1.5" />
      </svg>
    </div>;
  }

  const [width, height] = dimensions[reward.kind];
  return <div aria-hidden="true" className={`sp-artwork sp-artwork-${reward.kind.replaceAll(' ', '-').toLowerCase()}`}>
    {reward.kind === 'Avatar frame' ? <span className="sp-avatar-sample"><svg viewBox="0 0 100 100"><circle cx="50" cy="39" r="17" /><path d="M15 100V85C15 52 85 52 85 85V100Z" /></svg></span> : null}
    <Image src={`/cosmetics/season-1/${reward.id}.svg`} width={width} height={height} alt="" unoptimized loading={eager ? 'eager' : 'lazy'} />
  </div>;
}
