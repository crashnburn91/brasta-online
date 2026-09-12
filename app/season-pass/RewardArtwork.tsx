import Image from 'next/image';
import type { SeasonReward } from '../../lib/season-catalog';

const dimensions: Record<SeasonReward['kind'], [number, number]> = {
  'Card back': [300, 420],
  'Profile title': [240, 240],
  'Avatar frame': [300, 300],
  'Table felt': [600, 360],
};

export default function RewardArtwork({ reward, eager = false }: { reward: SeasonReward; eager?: boolean }) {
  const [width, height] = dimensions[reward.kind];
  if (reward.kind === 'Profile title') {
    return <div className="sp-profile-title-pair" aria-hidden="true">
      <div className="sp-artwork sp-artwork-profile-title">
        <Image src={`/cosmetics/season-1/${reward.id}.svg?v=2`} width={width} height={height} alt="" unoptimized loading={eager ? 'eager' : 'lazy'} />
      </div>
      <span className="sp-profile-title-name">{reward.name}</span>
    </div>;
  }
  return <div aria-hidden="true" className={`sp-artwork sp-artwork-${reward.kind.replaceAll(' ', '-').toLowerCase()}`}>
    {reward.kind === 'Avatar frame' ? <span className="sp-avatar-sample"><svg viewBox="0 0 100 100"><circle cx="50" cy="39" r="17" /><path d="M15 100V85C15 52 85 52 85 85V100Z" /></svg></span> : null}
    <Image src={`/cosmetics/season-1/${reward.id}.svg?v=2`} width={width} height={height} alt="" unoptimized loading={eager ? 'eager' : 'lazy'} />
  </div>;
}
