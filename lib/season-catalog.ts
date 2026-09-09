export type SeasonReward = {
  id: string;
  name: string;
  kind: 'Card back' | 'Card faces' | 'Profile title' | 'Avatar frame' | 'Table felt';
  tier: number;
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
  { id: 'first_seat', name: 'First Seat', kind: 'Profile title', tier: 1, premium: false, motif: 'I', color: 'green', description: 'An engraved chair medallion with a dotted coin edge, made to mark your first seat at the table.' },
  { id: 'gilded_suits', name: 'Gilded Court', kind: 'Card back', tier: 1, premium: true, motif: '♠', color: 'gold', description: 'Mirrored scrollwork and fine guilloche lines surround a spade medallion on a deep green field.' },
  { id: 'velvet_club', name: 'Velvet Conservatory', kind: 'Card back', tier: 2, premium: true, motif: '♣', color: 'green', description: 'Interwoven vines, engraved leaf veins, and clover blossoms frame a botanical club centerpiece.' },
  { id: 'golden_guest', name: 'Golden Guest', kind: 'Profile title', tier: 3, premium: true, motif: 'G', color: 'gold', description: 'The Golden Guest title with an engraved invitation badge, a gold border, and a garnet seal.' },
  { id: 'gilded_felt', name: 'Gilded Court Felt', kind: 'Table felt', tier: 3, premium: true, motif: '♠', color: 'gold', matchingCardBackId: 'gilded_suits', description: 'Deep green cloth with engraved gold scrolls and spade inlays, matching the Gilded Court card back. Fine ornament follows the rail around a quiet playing surface.' },
  { id: 'woven_green', name: 'Velvet Conservatory Felt', kind: 'Table felt', tier: 4, premium: false, motif: '♣', color: 'green', matchingCardBackId: 'velvet_club', description: 'Rich green fabric with curling vines, engraved leaf veins, and clover embroidery, matching the Velvet Conservatory card back.' },
  { id: 'laurel', name: 'Laureate Wreath', kind: 'Avatar frame', tier: 4, premium: true, motif: 'B', color: 'gold', description: 'Layered gold leaves circle your portrait, tied with an emerald ribbon and crowned by a small gold diamond.' },
  { id: 'ruby_diamond', name: 'Garnet Mosaic', kind: 'Card back', tier: 5, premium: true, motif: '♦', color: 'ruby', description: 'Faceted garnet glass sits within angular gold inlays and a repeating burgundy mosaic.' },
  { id: 'garnet_felt', name: 'Garnet Mosaic Felt', kind: 'Table felt', tier: 5, premium: true, motif: '♦', color: 'ruby', matchingCardBackId: 'ruby_diamond', description: 'A faceted garnet mosaic and geometric gold inlays surround deep plum felt, matching the Garnet Mosaic card back. The central area stays subdued for card visibility.' },
  { id: 'golden_wagon', name: 'Golden Wagon', kind: 'Card back', tier: 6, premium: true, motif: 'wagon-wheel', color: 'deep-red', description: 'A twelve-spoke gold wagon wheel with carved spokes, an engraved rim, and a riveted hub. Ornamental scrollwork and braided borders frame a deep red damask field.' },
  { id: 'ivory_faces', name: 'Ivory Engraved', kind: 'Card faces', tier: 6, premium: true, motif: 'A', color: 'ivory', description: 'An engraved botanical ace on warm ivory, with clear corner indices. The full deck will retain familiar ranks and red/black suits.' },
  { id: 'season_regular', name: 'Season Regular', kind: 'Profile title', tier: 7, premium: false, motif: 'S', color: 'green', description: 'The Season Regular title with a sage enamel badge showing a fan of cards and a clover crest.' },
  { id: 'golden_hour', name: 'Golden Wagon Felt', kind: 'Table felt', tier: 7, premium: true, motif: 'wagon-wheel', color: 'deep-red', matchingCardBackId: 'golden_wagon', description: 'Deep red fabric with damask edging, gold carriage scrolls, and the same engraved wheel medallions as the Golden Wagon card back.' },
  { id: 'four_suits', name: 'Fourfold Crest', kind: 'Profile title', tier: 8, premium: true, motif: '♠♦♣♥', color: 'gold', description: 'An octagonal seal holds four enamel inlays: spade, diamond, club, heart. Black and red suits sit against brushed gold.' },
  { id: 'ruby_frame', name: 'Garnet Halo', kind: 'Avatar frame', tier: 9, premium: true, motif: 'B', color: 'ruby', description: 'Sixteen faceted garnets and tiny gold beads form a jeweled halo around your portrait.' },
  { id: 'midnight', name: 'Midnight Observatory', kind: 'Card back', tier: 10, premium: true, motif: '♠', color: 'green', description: 'A crescent moon set inside a spade lens, surrounded by orbital rings, star charts, and an instrument dial.' },
  { id: 'midnight_felt', name: 'Midnight Observatory Felt', kind: 'Table felt', tier: 11, premium: true, motif: '♠', color: 'green', matchingCardBackId: 'midnight', description: 'Deep teal cloth bordered by fine star charts, instrument markings, and orbital spade inlays, matching the Midnight Observatory card back.' },
  { id: 'season_keepsake', name: 'Season Archive', kind: 'Profile title', tier: 11, premium: false, motif: 'I', color: 'ivory', description: 'A porcelain keepsake with an engraved Season 01 scroll and olive sprigs.' },
  { id: 'golden_brasta', name: 'Golden Brasta', kind: 'Profile title', tier: 12, premium: true, motif: 'B', color: 'gold', description: 'A layered sunburst seal with intricate gold engraving, a deep green center, and a raised Brasta B.' },
];

export function seasonTier(xp: number): number {
  return Math.min(SEASON_ONE.tiers, Math.floor(Math.max(0, Number.isFinite(xp) ? xp : 0) / SEASON_ONE.xpPerTier));
}
