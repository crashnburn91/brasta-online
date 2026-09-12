export const SEASON_SETS = {
  gilded_court: { name: 'Gilded Court', description: 'Engraved gold, warm ivory, and the emblems of a classic card room.' },
  royal_crown: { name: 'Royal Crown', description: 'Royal purple velvet, engraved gold rails, ruby accents, and a crowned crest.' },
  garnet_mosaic: { name: 'Garnet Mosaic', description: 'Faceted garnets, burgundy enamel, and geometric gold inlays.' },
  romani_heritage: { name: 'Romani Heritage', description: 'Deep red damask, engraved gold wagon wheels, and a bezel of gold coins.' },
  astrology: { name: 'Astrology', description: 'Deep teal, celestial charts, orbital rings, and gold instrument markings.' },
} as const;

export type SeasonSetId = keyof typeof SEASON_SETS;

export type SeasonReward = {
  id: string;
  name: string;
  kind: 'Card back' | 'Card faces' | 'Profile title' | 'Avatar frame' | 'Table felt';
  tier: number;
  setId: SeasonSetId;
  premium: boolean;
  motif: string;
  color: string;
  description: string;
  matchingCardBackId?: 'gilded_suits' | 'velvet_club' | 'ruby_diamond' | 'golden_wagon' | 'midnight';
};

// Profile titles are single rewards: the name and matching badge are owned and
// equipped together in Brasta’s existing profile-title slot.
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
  { id: 'first_seat', setId: 'gilded_court', name: 'First Seat', kind: 'Profile title', tier: 1, premium: false, motif: 'I', color: 'green', description: 'An engraved chair medallion with a dotted coin edge, made to mark your first seat at the table.' },
  { id: 'gilded_suits', setId: 'gilded_court', name: 'Gilded Court', kind: 'Card back', tier: 1, premium: true, motif: '♠', color: 'gold', description: 'Mirrored scrollwork and fine guilloche lines surround a spade medallion on a deep green field.' },
  { id: 'velvet_club', setId: 'royal_crown', name: 'Royal Crown', kind: 'Card back', tier: 2, premium: true, motif: '♛', color: 'purple', description: 'A ruby-and-gold crown crest, engraved rope border, and heraldic flourishes sit on a royal purple field.' },
  { id: 'golden_guest', setId: 'gilded_court', name: 'Golden Guest', kind: 'Profile title', tier: 3, premium: true, motif: 'G', color: 'gold', description: 'The Golden Guest title with an engraved invitation badge, a gold border, and a garnet seal.' },
  { id: 'gilded_felt', setId: 'gilded_court', name: 'Gilded Court Felt', kind: 'Table felt', tier: 3, premium: true, motif: '♠', color: 'gold', matchingCardBackId: 'gilded_suits', description: 'Deep green cloth with engraved gold scrolls and spade inlays, matching the Gilded Court card back. Fine ornament follows the rail around a quiet playing surface.' },
  { id: 'woven_green', setId: 'royal_crown', name: 'Royal Crown Felt', kind: 'Table felt', tier: 4, premium: false, motif: '♛', color: 'purple', matchingCardBackId: 'velvet_club', description: 'Responsive royal-purple cloth with gold rope rails, crown medallions, ruby accents, and a quiet center for clear play.' },
  { id: 'laurel', setId: 'romani_heritage', name: 'Gold Coin Bezel', kind: 'Avatar frame', tier: 4, premium: true, motif: 'gold-coins', color: 'gold', description: 'Sixteen individually engraved gold coins surround a deep red bezel, with tiny wheel stamps that match the Romani Heritage set.' },
  { id: 'ruby_diamond', setId: 'garnet_mosaic', name: 'Garnet Mosaic', kind: 'Card back', tier: 5, premium: true, motif: '♦', color: 'ruby', description: 'Faceted garnet glass sits within angular gold inlays and a repeating burgundy mosaic.' },
  { id: 'garnet_felt', setId: 'garnet_mosaic', name: 'Garnet Mosaic Felt', kind: 'Table felt', tier: 5, premium: true, motif: '♦', color: 'ruby', matchingCardBackId: 'ruby_diamond', description: 'A faceted garnet mosaic and geometric gold inlays surround deep plum felt, matching the Garnet Mosaic card back. The central area stays subdued for card visibility.' },
  { id: 'golden_wagon', setId: 'romani_heritage', name: 'Romani Heritage', kind: 'Card back', tier: 6, premium: true, motif: 'wagon-wheel', color: 'deep-red', description: 'A twelve-spoke gold wagon wheel with carved spokes, an engraved rim, and a riveted hub. Ornamental scrollwork and braided borders frame a deep red damask field.' },
  { id: 'ivory_faces', setId: 'gilded_court', name: 'Ivory Engraved', kind: 'Card faces', tier: 6, premium: true, motif: 'A', color: 'ivory', description: 'An engraved botanical ace on warm ivory, with clear corner indices. The full deck will retain familiar ranks and red/black suits.' },
  { id: 'season_regular', setId: 'royal_crown', name: 'Season Regular', kind: 'Profile title', tier: 7, premium: false, motif: '♛', color: 'purple', description: 'The Season Regular title with a royal-purple fan of cards and a gold crown crest.' },
  { id: 'golden_hour', setId: 'romani_heritage', name: 'Romani Heritage Felt', kind: 'Table felt', tier: 7, premium: true, motif: 'wagon-wheel', color: 'deep-red', matchingCardBackId: 'golden_wagon', description: 'Deep red fabric with damask edging, gold carriage scrolls, and the same engraved wheel medallions as the Romani Heritage card back.' },
  { id: 'four_suits', setId: 'gilded_court', name: 'Fourfold Crest', kind: 'Profile title', tier: 8, premium: true, motif: '♠♦♣♥', color: 'gold', description: 'An octagonal seal holds four enamel inlays: spade, diamond, club, heart. Black and red suits sit against brushed gold.' },
  { id: 'ruby_frame', setId: 'garnet_mosaic', name: 'Garnet Halo', kind: 'Avatar frame', tier: 9, premium: true, motif: 'B', color: 'ruby', description: 'Sixteen faceted garnets and tiny gold beads form a jeweled halo around your portrait.' },
  { id: 'midnight', setId: 'astrology', name: 'Astrology', kind: 'Card back', tier: 10, premium: true, motif: '♠', color: 'green', description: 'A crescent moon set inside a spade lens, surrounded by orbital rings, star charts, and an instrument dial.' },
  { id: 'astrology_title', setId: 'astrology', name: 'Astrology', kind: 'Profile title', tier: 10, premium: true, motif: 'crescent-spade', color: 'teal', description: 'The Astrology title with a deep teal enamel badge, using the same crescent spade, orbital rings, and engraved gold instrument dial as the card back.' },
  { id: 'midnight_felt', setId: 'astrology', name: 'Astrology Felt', kind: 'Table felt', tier: 11, premium: true, motif: '♠', color: 'green', matchingCardBackId: 'midnight', description: 'Deep teal cloth bordered by fine star charts, instrument markings, and orbital spade inlays, matching the Astrology card back.' },
  { id: 'astrology_frame', setId: 'astrology', name: 'Orbital Halo', kind: 'Avatar frame', tier: 11, premium: true, motif: 'crescent-spade', color: 'teal', description: 'An engraved deep teal bezel with fine gold instrument markings, crossing orbital arcs, and tiny star charts. A crescent-spade crest crowns the frame while the portrait opening stays clear.' },
  { id: 'season_keepsake', setId: 'royal_crown', name: 'Season Archive', kind: 'Profile title', tier: 11, premium: false, motif: '♛', color: 'purple', description: 'A Royal Crown seal with a gold crown, ruby enamel accents, and the Season Archive mark.' },
  { id: 'golden_brasta', setId: 'romani_heritage', name: 'Romani Heritage', kind: 'Profile title', tier: 12, premium: true, motif: 'wagon-wheel', color: 'gold', description: 'The Romani Heritage title with a matching gold wagon-wheel badge, using the same carved spokes, engraved rim, and riveted hub as the card back.' },
];

export function seasonTier(xp: number): number {
  return Math.min(SEASON_ONE.tiers, Math.floor(Math.max(0, Number.isFinite(xp) ? xp : 0) / SEASON_ONE.xpPerTier));
}
