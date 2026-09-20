# Season 1: The Golden Table

## Preview and beta equipment

`/season-pass` is an interactive design preview with a typed reward catalog,
set and free/premium filters, a selected reward showcase, and sample XP/Premium
controls for signed-out visitors. Signed-in visitors read their account-backed
Season Pass state through `/api/season-pass`. Season 1 is still seeded as a
`draft`: payments, season dates, and live XP awards are not enabled yet.

The proposed offer is $4.99 USD per eight-week season, with twelve tiers at
250 XP each. The catalog contains 20 cosmetics: 4 free and 16 premium.
Previously reached premium tiers unlock on purchase; unlocked cosmetics remain
after season end. Artwork and pacing remain proposed.

Equipment is integrated into the existing profile. Change frame sits beside the
portrait and opens a visual frame chooser. The Table tab contains separate card
back and felt collections. The existing Titles tab combines earned titles with
all five set badge/title pairs. There is no floating Cosmetics button.
Golden Spade is the only free set; every reward in the other four sets is premium.
New browser equipment defaults to Golden Spade. Premium styles remain available
for beta testing, and valid existing selections are preserved for signed-out
previews. Signed-in controls now read account equipment and send equip/restore
requests through the verified Season Pass API; the server only accepts rewards
already present in that account's ownership ledger. Retired and invalid IDs are
cleared without changing valid selections. This is still a testing surface,
not a paid reward claim.

## Account foundation (implemented)

The `season_pass_core` and `season_pass_hardening` migrations now provide stable
Season 1 tables for seasons, sets, rewards, progress, an idempotent XP ledger,
entitlements, reward ownership, and slot equipment. Browser roles have no table
grants and explicit deny policies; only the trusted server role can write these
records. The API derives the player ID from the verified access token; a client
cannot choose the account, XP amount, ownership, or premium status.

## Match progression (implemented, inactive until scheduled)

`season_pass_match_awards` connects authoritative `brasta_record_completed_match`
transactions to Season XP. A deferred insert trigger waits for every player seat
to be saved, then calls `brasta_award_season_pass_match(match_id)`. This covers the
existing Vercel and standalone realtime writers without a second client request.
The old arbitrary-amount XP RPC is no longer executable by the service role.

Initial configurable defaults are 25 completion XP and 25 additional winner XP.
Ranked and private 1v1/2v2 matches qualify only if all seats are distinct signed-in
accounts, the match ends normally at its target score, and the recorded winner
matches the score. Bots, guests, forfeits, abandoned games and invalid results
receive no Season XP. These defaults still need pacing/playtest approval.

Matches must start on/after the season start and finish strictly before its end.
Draft seasons award nothing. A valid completed match delivered after the season
ends can still be recorded and awarded. Activation requires both dates; this
migration leaves Season 1 draft with no dates or real purchase entitlements.

The ledger's unique account/season/match/source keys prevent repeat awards.
Progress caps at 3,000 XP for the seeded season. Match history, XP, and eligible
reward grants commit or roll back together. Per-player/season transaction locks
serialize progression and reward grants. Activating a premium entitlement grants
already reached premium rewards automatically. Ownership remains after season end.

Run `npm run test:season-pass` for isolated Postgres tests using the actual shipped
recorder and migrations, plus authenticated API boundary tests. This is part of
the build gate. Tests cover draft/date boundaries, excluded matches, 2v2 winners,
retries, tier caps, late premium upgrades, rollback, ownership/slot checks, and
role permissions. They never modify real accounts or live XP.

The account UI now fails closed during loading/errors, rejects overlapping saves,
ignores responses from a previous session, and keeps guest preview preferences
separate from account equipment. Opening the account profile or refocusing the
window refreshes ownership. `scripts/cosmetics-tests.mjs` covers failed requests,
account switches, logout during a save, refreshed unlocks, and persisted removal.

Remaining launch work: payment verification and lifecycle handling, public
opponent cosmetic display rules, an explicit policy for legacy beta selections,
final XP pacing/eligibility, and scheduling the season after acceptance testing.

## Five complete sets

### Progression verification — 2026-09-14

The isolated database suite now runs complete free and Premium seasons through
60 recorded wins each, checking the authenticated collection after every match.
It verifies every tier boundary, all 4 free/20 total rewards, the 3,000 XP cap,
and equipping retained rewards after season end. Separate cases verify each
ranked/private 1v1/2v2 format awards 50 XP to winners and 25 XP to losers exactly
once when recording is retried. Existing tests cover ineligible matches, delayed
delivery, late Premium activation, account isolation, and rollback.

Validation: 37 database, 4 API, 6 beta access, and 23 cosmetics UI tests passed.
Live read-only checks confirmed the award triggers are enabled and Season 1
remains draft, with no start/end dates. No live XP, purchases, or rewards were
changed. This verifies the recorder-to-database and account UI boundaries;
a real multiplayer playthrough and payment-provider verification remain launch
acceptance steps.

Every set has exactly four rewards: one card back, one responsive table felt,
one matching avatar frame, and one badge/title pair. Each profile title describes
the player and has its own thematic name, separate from the set name. The badge
and title equip together as one reward.

| Set | Card back | Table felt | Avatar frame | Badge/title |
| --- | --- | --- | --- | --- |
| Golden Spade | Golden Spade | Golden Spade Felt | Gilded Bezel | Ace of Spades, gold spade medallion |
| Royal Crown | Royal Crown | Royal Crown Felt | Royal Diadem | Sovereign, ruby-and-gold crown |
| Grand Ruby | Grand Ruby | Grand Ruby Felt | Ruby Halo | Ruby Baron, faceted ruby |
| Romani Heritage | Romani Heritage | Romani Heritage Felt | Gold Coin Bezel | Gypsy, engraved wagon wheel |
| Astrology | Astrology | Astrology Felt | Orbital Halo | Stargazer, crescent-spade instrument dial |

Each reward belongs to one set through its required `setId`. Set and access
filters use the same catalog; detail previews list the other three pieces with
their reward type, tier, and access. Each felt records its `matchingCardBackId`.
The root layout supplies this same catalog to the profile UI, so names and access
labels are not duplicated. `scripts/cosmetics-tests.mjs` checks the shipped assets,
set access, equipment controls, original profile tabs, title switching, persistence,
failed requests, and photo preservation with the actual client scripts.

Card faces, Fourfold Crest, Season Regular, and Season Archive have been removed.
Golden Guest has also been retired to leave one title per set. The former free
First Seat slot (`first_seat`, tier 1) is now the Ace of Spades badge/title, using
the card's spade medallion. New matching pieces occupy the remaining revised slots:

| ID | Reward | Tier | Access |
| --- | --- | --- | --- |
| gilded_frame | Gilded Bezel | 3 | Free |
| royal_title | Sovereign badge/title | 7 | Premium |
| garnet_title | Ruby Baron badge/title | 8 | Premium |
| royal_frame | Royal Diadem | 11 | Premium |

Royal Crown replaces Velvet Conservatory; its card back (`velvet_club`) and felt
(`woven_green`) retain their existing IDs. Other surviving reward IDs are preserved. The retired SVG files and generator entries are removed.

Golden Spade and Grand Ruby retain the internal set IDs `gilded_court` and
`garnet_mosaic`. Reward IDs also stay stable when display names change, so saved
equipment keeps working. The profile controls, previews, and SVG metadata
use the current names.

## Matching artwork and responsive equipment

Regenerate the 20 editable SVG assets with `node scripts/build-season-art.mjs`.
The deterministic artwork generator uses no external assets or dependencies.
New badges reuse the corresponding card's spade, crown, or ruby geometry.
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
Selecting a cosmetic title overrides the earned-title display. Selecting an
earned title changes both account equipment records in one server transaction.
Remove explicitly leaves no title. The saved `titleSource` distinguishes season,
earned, and none, preventing an old earned badge from silently reappearing.
The `season_pass_title_selection` migration stores this distinction per account.
Other players' earned-title collections and server ownership checks are unchanged.

Public profile lookups still need to expose the selected season badge/title and
frame to other players. The player's own profile already combines both title
collections. Each season badge/title stays a single owned item.

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
   define which card backs and profile cosmetics opponents see. The first
   account-backed equip endpoint is now in place; legacy browser selections still
   need an explicit migration policy before launch.
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

Match progression and account equipment are implemented. Payments and launch
acceptance work remain pending; this must not be represented as an operational
paid pass until verified purchasing and a dated season are enabled.


## Beta tester collection
The server uses test equipment only when VERCEL_ENV is preview and VERCEL_GIT_COMMIT_REF is beta. Request flags and browser storage cannot enable it.
Authenticated test RPCs additionally require an enabled row in private.season_pass_test_access for auth.uid(). The migration grants no accounts access by default.
Administrators can enable a verified player with an explicit allowlist row. Set enabled=false to revoke; the next read/equip uses normal ownership again.
Test selections persist in private.season_pass_test_equipment, separate from real equipment, XP, reward ownership, and Premium entitlements. No season activation is required. The UI labels this access Beta test.
Main and other branches always use the regular collection. Test equipment is for the tester's UI; it does not grant public-profile ownership or purchases.

## Stripe sandbox checkout (beta only)

Beta testers now have a Test Premium checkout section on `/season-pass`.
This is test-mode payment plumbing, not a live sale or Premium entitlement.
It is enabled only on the Vercel `beta` preview branch, with a Stripe `sk_test_`
key, a webhook signing secret, and the Supabase server credential configured.
The account must also have existing beta test access. Other visitors cannot
start checkout. Production and live Stripe keys are explicitly rejected.

Configure these **server-only** variables for Preview / beta:
- `STRIPE_SECRET_KEY`: Stripe sandbox/test-mode secret (`sk_test_...`).
- `STRIPE_WEBHOOK_SECRET`: signing secret for the endpoint below (`whsec_...`).
- `SUPABASE_SECRET_KEY`: existing server credential.

Register `https://beta.brasta.app/api/season-pass/webhook` in the same Stripe
sandbox for `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`, and `charge.refunded`. Redeploy
beta after saving the variables. No publishable Stripe key is needed for hosted
checkout, and no Stripe product/price needs to be created manually.

The server takes the amount and currency from the season catalog ($4.99 USD),
uses fixed beta return URLs, and binds each order to the authenticated account.
It reuses pending orders with a stable Stripe idempotency key. Verified webhook
signatures are required; the handler retrieves current Stripe session state
and checks mode, account, order, season, amount, currency and payment status.
Paid receipts are idempotent and cannot be downgraded by delayed unpaid/expired
events. Failed processing returns 500 for provider retries. Redirects alone
never mark an order paid. Only service-role RPCs can change test receipt rows.

Test receipts live in `season_pass_checkout_tests`. They have **no connection**
to real Premium entitlements, reward ownership, or Season XP. A tester can see
payment status after returning, refocusing, or clicking Refresh status.
An active paid test receipt is reused; after a full refund a fresh test checkout
can be created. Status refresh retrieves current Stripe state before reporting fulfillment.

Before enabling real sales: run the hosted Stripe test checkout and webhook
retry cases, implement refund/dispute reconciliation and the final entitlement
policy, integrate verified receipts with production grants, verify mobile
purchase requirements, and approve season dates. These steps are not enabled
by supplying sandbox credentials.

## Verified payment fulfillment foundation

`brasta_reconcile_web_pass_receipt` is a service-role-only, atomic database
operation for a future verified live Stripe adapter. It is not called by the
sandbox checkout, and adding this function does not enable sales or activate
the season. Never call it from a browser or trust client-supplied receipt data.
The adapter must verify Stripe signatures and retrieve provider state, bind the
payment intent to a server-created order, and supply its immutable purchase time.

The operation validates sale dates, catalog amount/currency and live mode,
binds each Stripe payment intent to one player and season, and grants only
reached tiers through the existing reward function. Duplicate success is safe.
Delayed delivery after the season ends is supported for purchases made during
its sale window. Refunded and revoked receipts are terminal: old success events
cannot restore them. A fresh valid purchase can restore earned Premium rewards.

Refund/revocation removes Premium ownership sourced from purchases only when
no other active entitlement covers that season. It clears affected equipped
card backs, felts, frames and seasonal titles; free rewards, XP, independently
admin-granted ownership and earned achievement badges remain intact.

Pending: live order creation/checkout gate, verified provider adapter, refund
and dispute event subscriptions/reconciliation, partial-refund policy and
end-to-end fulfillment testing in an isolated sandbox model. Do not forward
sandbox receipts into this live function. No production payment flow is enabled.


## Sandbox Premium fulfillment and refunds

Beta now reconciles verified sandbox receipts into `fulfillment_status`,
`payment_intent_id`, `amount_refunded` and `test_reward_ids` on the isolated
`season_pass_checkout_tests` record. The service-only RPC validates the receipt
and atomically records payment and test grants. It never calls the live receipt
function or writes real entitlements, ownership, XP or equipment.

Paid Checkout sessions are checked against the server order, then the current
PaymentIntent and captured Charge are retrieved. The payment/charge/session
relationship, test mode, amount and currency must all agree. A `charge.refunded`
event locates its Checkout session by PaymentIntent, so refunds arriving before
completion are handled. Provider or database failures return an error for retry.
GET status performs the same reconciliation, supporting existing receipts and
recovery from missed notifications. Browsers can only request their own status.

An active test Premium receipt snapshots earned premium reward IDs using the
account's real Season XP, and later refreshes add newly reached rewards. At zero
Season XP it is active with zero earned test rewards. Full refunds clear that
receipt's grants permanently; a late success cannot reactivate it. Partial
refunds retain access in this **sandbox-only** policy. Cumulative refunded amount
never decreases. This does not finalize the policy for real purchases.

Tester access to all 20 cosmetic previews remains independent of this payment
simulation; it is not proof of purchase ownership. No new equipment path is
introduced. The page explicitly separates test Premium from preview access.

Stripe setup: add `charge.refunded` to the existing **test** webhook destination.
Then refresh status on the existing paid test, verify **Test Premium active**,
refund that payment in Stripe's sandbox, and verify **Test payment refunded**.
A fresh test checkout is available after a full refund. No real refund is issued
by the app. Automated checks cover these transitions with isolated data; actual
Stripe refund delivery still needs the sandbox dashboard test.

Remaining: live checkout/provider adapter, dispute reconciliation, final real
refund policy, production purchase gates and launch schedule. Season 1 stays draft.

## Disputes and gated live payment backend

Sandbox webhooks also accept `charge.dispute.created`, `charge.dispute.updated`
and `charge.dispute.closed`. The adapter retrieves current disputes by verified
charge. Open disputes suspend Premium grants; a won/closed inquiry restores
eligible grants; lost disputes revoke them. Full refunds always take precedence.
Database reconciliation preserves terminal dispute outcomes against older
open/no-dispute snapshots. Multiple disputes or a different dispute ID require
manual review. Beta preview cosmetic access remains independent.

The live backend is implemented but **not enabled**:
- `POST /api/season-pass/purchase` verifies the signed-in account and creates/reuses
  a server-priced order, then redirects to Stripe hosted checkout.
- `POST /api/season-pass/payment-webhook` verifies the separate live signature,
  retrieves current session/payment/charge/dispute state and atomically reconciles
  the live order with real entitlements, reached rewards and equipment cleanup.
- Live execution requires Vercel production on `main`, `STRIPE_SECRET_KEY` starting
  with `sk_live_`, `STRIPE_LIVE_WEBHOOK_SECRET`, and the server Supabase credential.
- New purchases additionally require `BRASTA_LIVE_SEASON_PASS_ENABLED=true` and
  `season_pass_sales_settings.enabled=true`. The database switch is seeded false.
  The season must be active, started, and have at least 31 minutes left for checkout.
- Webhooks continue processing existing purchases after the new-purchase switch
  is disabled, so refunds/disputes still reconcile. Keep live credentials installed.
- Test and live orders, signing secrets, routes and idempotency keys are separate.
  No live credentials or sales switches were configured by this implementation.

Before launch: finalize dates, XP and full/partial refund policy (currently partial
refunds retain access); finish customer-facing purchase/restore UI; configure and
verify the separate live webhook destination with the four Checkout events,
`charge.refunded`, and the three dispute events; review native-app billing; then
explicitly approve main deployment and sales activation. The live backend is
covered by isolated database/provider tests, not an actual live Stripe payment.
