export type SeasonReward = {
  id: string;
  name: string;
  kind: 'Card back' | 'Card faces' | 'Badge' | 'Avatar frame' | 'Table felt' | 'Title';
  tier: number;
  premium: boolean;
  motif: string;
  color: string;
  description: string;
};

// Preview catalog: dates and XP tuning remain unset until the season launches.
export const SEASON_ONE = {
  id: 'season_1',
  name: 'The Golden Table',
  priceCents: 499,
  currency: 'USD',
  durationWeeks: 8,
  tiers: 12,
  xpPerTier: 250,
} as const;

export const SEASON_REWARDS: SeasonReward[] = [
  { id: 'first_seat', name: 'First Seat', kind: 'Badge', tier: 1, premium: false, motif: 'I', color: 'green', description: 'A keepsake from Brasta’s first season.' },
  { id: 'gilded_suits', name: 'Gilded Suits', kind: 'Card back', tier: 1, premium: true, motif: '♠', color: 'gold', description: 'Matte gold filigree over deep green.' },
  { id: 'velvet_club', name: 'Velvet Club', kind: 'Card back', tier: 2, premium: true, motif: '♣', color: 'green', description: 'A restrained club pattern with a gold border.' },
  { id: 'golden_guest', name: 'Golden Guest', kind: 'Title', tier: 3, premium: true, motif: 'G', color: 'gold', description: 'An ornamental title, separate from your competitive rank.' },
  { id: 'woven_green', name: 'Woven Green', kind: 'Table felt', tier: 4, premium: false, motif: '♣', color: 'green', description: 'A subtle woven texture for your own table view.' },
  { id: 'laurel', name: 'Golden Laurel', kind: 'Avatar frame', tier: 4, premium: true, motif: 'B', color: 'gold', description: 'A warm gold frame around your profile picture.' },
  { id: 'ruby_diamond', name: 'Ruby Diamond', kind: 'Card back', tier: 5, premium: true, motif: '♦', color: 'ruby', description: 'Deep burgundy with a repeating diamond pattern.' },
  { id: 'ivory_faces', name: 'Ivory Classic', kind: 'Card faces', tier: 6, premium: true, motif: 'A', color: 'ivory', description: 'Cream card faces with familiar ranks and red/black suits.' },
  { id: 'season_regular', name: 'Season Regular', kind: 'Title', tier: 7, premium: false, motif: 'S', color: 'green', description: 'A little recognition for time spent at the table.' },
  { id: 'golden_hour', name: 'Golden Hour', kind: 'Table felt', tier: 7, premium: true, motif: '♦', color: 'gold', description: 'Dark green felt with a quiet gold edge.' },
  { id: 'four_suits', name: 'Four Suits', kind: 'Badge', tier: 8, premium: true, motif: '♠♦♣♥', color: 'gold', description: 'The four suits in Brasta’s signature order.' },
  { id: 'ruby_frame', name: 'Ruby Frame', kind: 'Avatar frame', tier: 9, premium: true, motif: 'B', color: 'ruby', description: 'Burgundy enamel enclosed by matte gold.' },
  { id: 'midnight', name: 'Midnight Spade', kind: 'Card back', tier: 10, premium: true, motif: '♠', color: 'green', description: 'An oversized spade on a deep green field.' },
  { id: 'season_keepsake', name: 'Season Keepsake', kind: 'Badge', tier: 11, premium: false, motif: 'I', color: 'ivory', description: 'A permanent memento of your Season 1 progress.' },
  { id: 'golden_brasta', name: 'Golden Brasta', kind: 'Badge', tier: 12, premium: true, motif: 'B', color: 'gold', description: 'The final reward: a softly shimmering gold Brasta emblem.' },
];

export function seasonTier(xp: number): number {
  return Math.min(SEASON_ONE.tiers, Math.floor(Math.max(0, Number.isFinite(xp) ? xp : 0) / SEASON_ONE.xpPerTier));
}
