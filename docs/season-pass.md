# Season 1: The Golden Table

## Reviewable first delivery

`/season-pass` is an interactive design preview. It contains a typed reward catalog,
free/premium filters, artwork treatments, a selected reward showcase, and sample
XP/Premium controls. All simulated progress is held in component memory. No
account ownership, payments, season start dates, or live XP awards are enabled.

Proposed offer: $4.99 USD, one purchase per eight-week season, twelve tiers at
250 XP each. Four free rewards and twelve premium cosmetics, including the deep
red Golden Wagon card back with a centered gold wagon wheel at tier six. Previously reached
premium tiers unlock on purchase. Unlocked cosmetics remain after season end.
Visuals are CSS concept treatments, not final production artwork.

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
