# Season 1: The Golden Table

## Reviewable first delivery

`/season-pass` is an interactive design preview. It contains a typed reward catalog,
set and free/premium filters, artwork treatments, a selected reward showcase, and sample
XP/Premium controls. All simulated progress is held in component memory. No
account ownership, payments, season start dates, or live XP awards are enabled.

Proposed offer: $4.99 USD, one purchase per eight-week season, twelve tiers at
250 XP each. Four free rewards and seventeen premium cosmetics, including the deep
red Romani Heritage card back with a centered gold wagon wheel at tier six. Previously reached
premium tiers unlock on purchase. Unlocked cosmetics remain after season end.
Artwork uses individually drawn SVG designs, with distinct engraving, botanical,
geometric, and celestial themes. Profile titles with matching badges, frames, and table felts
have artwork suited to their own shapes; selecting a reward opens a larger detail
view. Romani Heritage keeps its centered gold wheel and deep red field, with carved
spokes, an engraved rim, a riveted hub, scrollwork, and a damask pattern. It uses
the same scalable artwork renderer as the other card backs. The Ivory Engraved preview shows one
ace; the full face deck remains to be drawn. All artwork remains proposed.

Regenerate the twenty-one SVG assets with `node scripts/build-season-art.mjs`.
The artwork generator uses no external assets or dependencies.

## Cosmetic sets

Every reward belongs to one named set through its required `setId`. The catalog
groups rewards by set and offers a set selector alongside the free/premium
filters. Every detail preview lists the other pieces in its set, with each
piece's reward type, tier, and access shown. Tier and access remain per item.

| Set | Cosmetics |
| --- | --- |
| Gilded Court | Gilded Court card back and felt, Ivory Engraved faces, First Seat, Golden Guest, Fourfold Crest (6) |
| Velvet Conservatory | Velvet Conservatory card back and felt, Season Regular, Season Archive (4) |
| Garnet Mosaic | Garnet Mosaic card back and felt, Garnet Halo frame (3) |
| Romani Heritage | Romani Heritage card back and felt, Romani Heritage title with wheel badge, Gold Coin Bezel frame (4) |
| Astrology | Astrology card back and felt, Astrology title with crescent-spade badge, Orbital Halo frame (4) |

Romani Heritage replaces the Golden Wagon set name. Its profile title replaces
Golden Brasta with the exact engraved wheel from the matching card back. Gold
Coin Bezel replaces Laureate Wreath: sixteen gold coins, each with a beaded rim
and a small wheel engraving, surround a red enamel bezel and transparent portrait
opening. Astrology replaces Midnight Observatory. Stable reward IDs, unlock
tiers, and free/premium access are unchanged by these presentation updates.

### Astrology badge and avatar frame

The premium Astrology title and badge (`astrology_title`, tier 10) reuse the card
back's crescent-spade geometry, orbital rings, and engraved instrument dial on a
deep teal enamel medallion. The title and badge remain one reward.

The premium Orbital Halo frame (`astrology_frame`, tier 11) carries the same teal
and gold palette into a circular instrument bezel with constellation markings,
orbital arcs, and a crescent-spade crest. The 300 × 300 SVG has a transparent
portrait opening with a 99-unit clear radius; orbital lines are masked to the
bezel. Both additions appear in the Astrology set, filters, and related-item
previews. The catalog now has 21 rewards: 4 free and 17 premium.

## Matching card backs and table felts

Each of the five card backs now has a matching felt. The two initial felt rewards
are replaced by Velvet Conservatory Felt (free, tier 4, stable ID `woven_green`)
and Romani Heritage Felt (premium, tier 7, stable ID `golden_hour`). Three additional
premium felts complete the sets: Gilded Court at tier 3, Garnet Mosaic at tier 5,
and Astrology at tier 11. Including the Astrology title and frame, the catalog
has 21 rewards: 4 free and 17 premium.

The catalog records each felt's `matchingCardBackId`, and the detail dialog lets
players browse every item in the set. Matching is visual: card back and
felt ownership/equipment remain separate. Each is one reward. Artwork carries
the card back's palette and edge motifs, with a low-contrast playing area; Romani
Heritage Felt reuses the exact engraved wheel geometry from the card back.

Felt previews match the game’s slightly rounded rectangular table. The 600 × 360
artwork uses a 24-unit outer corner radius with concentric inset borders, straight
side decorations, and rectangular quiet-area masks. This follows the desktop
table’s 24px radius; compact gameplay uses 12–17px corners. Corners have their own
matching ornaments, and the Astrology markings follow the straight rails.

## Profile titles and badges are one reward

Brasta already owns and equips profile identities as one item: a title name plus
its badge icon, with one selected `badge_key` in `player_profile_badge_equipment`.
Season rewards follow that same model. There is one `Profile title` reward kind;
there are no separate badge-only or title-only ownership/equipment slots.

The seven paired rewards are First Seat, Golden Guest, Season Regular, Fourfold
Crest, Season Archive, Romani Heritage, and Astrology. Each unlock includes its matching badge
and title name and counts as one cosmetic. Golden Guest and Season Regular now
have badge emblems instead of standalone title plaques. The catalog remains four
free rewards and seventeen premium rewards. The preview shows each pair together.

When implementing season ownership, register each pair as a single profile badge
definition and grant it through the existing profile title collection. Use the
existing single equipped-title slot. Extend the verified server award source to
support season entitlements, without relaxing ownership checks or modifying
achievement/admin title rules. Do not also grant an independent title item.

## Production implementation requirements

1. Finalize art and XP pacing after preview review. Separate cosmetic titles from
   competitive rank. Preserve standard red/black suits and card legibility.
2. Store seasons, catalog entries, purchase records, XP ledger entries, cosmetic
   ownership and equipment in Supabase. Use stable catalog IDs from the preview.
   RLS must prevent clients writing purchases, XP or ownership. Verified server
   APIs derive the account from the access token, never a supplied player ID.
3. Award XP from finalized server match records, once per account/match/season.
   Use a unique ledger constraint, a transaction, and season date bounds. Tune
   completion and win XP before introducing event bonuses. Bot matches and
   abandoned games need explicit eligibility rules before launch.
4. Use a transaction to grant eligible rewards, including retroactive premium
   rewards. Equipment must reference owned items of the correct slot. Restore
   account inventory after login and across devices. Apply faces/felt locally;
   define which card backs and profile cosmetics opponents see.
5. Web: authenticated Stripe Checkout with server-controlled product/price and
   return URLs. Fulfill only verified paid webhook events. Deduplicate provider
   events and transaction IDs; reconcile refunds and disputes.
6. Android: implement Play Billing, server receipt verification, pending purchase
   handling, acknowledgement, restore, and purchase lifecycle notifications.
   Existing sideloaded APK distribution needs a distinct purchase configuration
   from Play distribution. Never expose a web checkout in a Play build unless
   the applicable Google program requirements have been satisfied.
7. Before sales: test duplicate events, tampered prices, wrong accounts, pending
   payments, restored purchases, refunds, late-season upgrades, concurrent reward
   grants, and season rollover. Schedule the season only once this passes.

Payments and backend work remain pending; this preview must not be represented
as an operational paid pass.
