# Season 1: The Golden Table

## Preview and beta equipment

`/season-pass` is an interactive design preview with a typed reward catalog,
set and free/premium filters, a selected reward showcase, and sample XP/Premium
controls. Simulated progress stays in component memory. Account ownership,
payments, season dates, and live XP awards are not enabled.

The proposed offer is $4.99 USD per eight-week season, with twelve tiers at
250 XP each. The catalog contains 20 cosmetics: 4 free and 16 premium.
Previously reached premium tiers unlock on purchase; unlocked cosmetics remain
after season end. Artwork and pacing remain proposed.

The beta Cosmetics picker can equip any complete set or mix individual pieces.
Its four slots are card back, table felt, avatar frame, and profile title + badge.
Equipment is saved locally under `brasta-beta-cosmetics-v1`. Retired and invalid
IDs are cleared without changing valid selections. This is a testing surface,
not account ownership or a paid reward claim.

## Five complete sets

Every set has exactly four rewards: one card back, one responsive table felt,
one matching avatar frame, and one badge/title pair. The set name is also its
displayed profile title. The badge and title equip together as one reward.

| Set | Card back | Table felt | Avatar frame | Badge/title |
| --- | --- | --- | --- | --- |
| Gilded Court | Gilded Court | Gilded Court Felt | Gilded Bezel | Gilded Court, gold spade medallion |
| Royal Crown | Royal Crown | Royal Crown Felt | Royal Diadem | Royal Crown, ruby-and-gold crown |
| Garnet Mosaic | Garnet Mosaic | Garnet Mosaic Felt | Garnet Halo | Garnet Mosaic, faceted garnet |
| Romani Heritage | Romani Heritage | Romani Heritage Felt | Gold Coin Bezel | Romani Heritage, engraved wagon wheel |
| Astrology | Astrology | Astrology Felt | Orbital Halo | Astrology, crescent-spade instrument dial |

Each reward belongs to one set through its required `setId`. Set and access
filters use the same catalog; detail previews list the other three pieces with
their reward type, tier, and access. Each felt records its `matchingCardBackId`.
The beta presets must stay aligned with the catalog; `scripts/cosmetics-tests.mjs`
checks every slot, label, preset, and shipped asset against it.

Card faces, Fourfold Crest, Season Regular, and Season Archive have been removed.
Golden Guest has also been retired to leave one title per set. The former free
First Seat slot (`first_seat`, tier 1) is now the Gilded Court badge/title, using
the card's spade medallion. New matching pieces occupy the remaining revised slots:

| ID | Reward | Tier | Access |
| --- | --- | --- | --- |
| gilded_frame | Gilded Bezel | 3 | Premium |
| royal_title | Royal Crown badge/title | 7 | Free |
| garnet_title | Garnet Mosaic badge/title | 8 | Premium |
| royal_frame | Royal Diadem | 11 | Free |

Royal Crown replaces Velvet Conservatory; its card back (`velvet_club`) and felt
(`woven_green`) retain their existing IDs. Other surviving reward IDs and access
are preserved. The retired SVG files and generator entries are removed.

## Matching artwork and responsive equipment

Regenerate the 20 editable SVG assets with `node scripts/build-season-art.mjs`.
The deterministic artwork generator uses no external assets or dependencies.
New badges reuse the corresponding card's spade, crown, or garnet geometry.
Romani Heritage shares an engraved wagon wheel; Astrology shares its crescent
spade, orbital rings, and instrument dial across the set.

Avatar frames use a transparent 300 × 300 canvas. Their ornament remains inside
the square while the centered portrait uses 66% of the canvas. Only the portrait
is clipped to a circle; the frame stays visible in the surrounding square.
Changing or removing cosmetics preserves the loaded profile photo.

Felts use 600 × 360 SVG artwork with a 24-unit border slice. The game applies
these as a filled nine-slice border on its responsive table, allowing the entire
felt and rails to follow the table at different aspect ratios. Card backs and
felts remain separate equipment choices. Ornament stays strongest at the rails,
with a quiet center for clear card visibility.

## Profile titles and badges are one reward

There is one profile title reward per set. Its badge art and title name are
shown together in previews, on the player's own match card, and in their profile.
Clearing a test title restores the existing earned badge display.

Future season ownership should register each pair as one profile badge definition
and grant it through the existing title collection and single equipped-title slot.
Extend verified server awards to support season entitlements without relaxing
ownership checks or changing achievement/admin title rules. Do not grant a
separate title item.

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
   account inventory after login and across devices. Apply table felt locally;
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
