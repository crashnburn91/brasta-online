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
  { id: 'first_seat', name: 'First Seat', kind: 'Badge', tier: 1, premium: false, motif: 'I', color: 'green', description: 'An engraved chair medallion with a dotted coin edge, made to mark your first seat at the table.' },
  { id: 'gilded_suits', name: 'Gilded Court', kind: 'Card back', tier: 1, premium: true, motif: '♠', color: 'gold', description: 'Mirrored scrollwork and fine guilloche lines surround a spade medallion on a deep green field.' },
  { id: 'velvet_club', name: 'Velvet Conservatory', kind: 'Card back', tier: 2, premium: true, motif: '♣', color: 'green', description: 'Interwoven vines, engraved leaf veins, and clover blossoms frame a botanical club centerpiece.' },
  { id: 'golden_guest', name: 'Golden Guest', kind: 'Title', tier: 3, premium: true, motif: 'G', color: 'gold', description: 'A gold-inlaid invitation plaque with diamond endcaps and an engraved green center.' },
  { id: 'woven_green', name: 'Woven Green', kind: 'Table felt', tier: 4, premium: false, motif: '♣', color: 'green', description: 'Fine linen weave and hand-stitched sage edging, with a quiet center that keeps the cards easy to read.' },
  { id: 'laurel', name: 'Laureate Wreath', kind: 'Avatar frame', tier: 4, premium: true, motif: 'B', color: 'gold', description: 'Layered gold leaves circle your portrait, tied with an emerald ribbon and crowned by a small gold diamond.' },
  { id: 'ruby_diamond', name: 'Garnet Mosaic', kind: 'Card back', tier: 5, premium: true, motif: '♦', color: 'ruby', description: 'Faceted garnet glass sits within angular gold inlays and a repeating burgundy mosaic.' },
  { id: 'golden_wagon', name: 'Golden Wagon', kind: 'Card back', tier: 6, premium: true, motif: 'wagon-wheel', color: 'deep-red', description: 'A golden twelve-spoke wagon wheel centered on deep red, framed by a fine gold border.' },
  { id: 'ivory_faces', name: 'Ivory Engraved', kind: 'Card faces', tier: 6, premium: true, motif: 'A', color: 'ivory', description: 'An engraved botanical ace on warm ivory, with clear corner indices. The full deck will retain familiar ranks and red/black suits.' },
  { id: 'season_regular', name: 'Season Regular', kind: 'Title', tier: 7, premium: false, motif: 'S', color: 'green', description: 'A sage enamel title plaque with clover endcaps and fine inset borders.' },
  { id: 'golden_hour', name: 'Golden Hour', kind: 'Table felt', tier: 7, premium: true, motif: '♦', color: 'gold', description: 'Art Deco sunrise lines trace the gold rail around rich green woven felt. Ornament stays at the edges of play.' },
  { id: 'four_suits', name: 'Fourfold Crest', kind: 'Badge', tier: 8, premium: true, motif: '♠♦♣♥', color: 'gold', description: 'An octagonal seal holds four enamel inlays: spade, diamond, club, heart. Black and red suits sit against brushed gold.' },
  { id: 'ruby_frame', name: 'Garnet Halo', kind: 'Avatar frame', tier: 9, premium: true, motif: 'B', color: 'ruby', description: 'Sixteen faceted garnets and tiny gold beads form a jeweled halo around your portrait.' },
  { id: 'midnight', name: 'Midnight Observatory', kind: 'Card back', tier: 10, premium: true, motif: '♠', color: 'green', description: 'A crescent moon set inside a spade lens, surrounded by orbital rings, star charts, and an instrument dial.' },
  { id: 'season_keepsake', name: 'Season Archive', kind: 'Badge', tier: 11, premium: false, motif: 'I', color: 'ivory', description: 'A porcelain keepsake with an engraved Season 01 scroll and olive sprigs.' },
  { id: 'golden_brasta', name: 'Golden Brasta', kind: 'Badge', tier: 12, premium: true, motif: 'B', color: 'gold', description: 'A layered sunburst seal with intricate gold engraving, a deep green center, and a raised Brasta B.' },
];

export function seasonTier(xp: number): number {
  return Math.min(SEASON_ONE.tiers, Math.floor(Math.max(0, Number.isFinite(xp) ? xp : 0) / SEASON_ONE.xpPerTier));
}
