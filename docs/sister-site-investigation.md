# Six Card Golf: sister-site investigation

Investigated October 23, 2026. This is the starting brief for implementation.
Fraunces, enlarged Argyle, and Sage & Blush Peach are selected. The game-screen
composition remains deferred.

The first implementation now lives in `web/`: home, play/setup menus, rules,
about, shared sign-in, and profile. The profile now includes local solo-game
statistics and achievements, and the username button opens it directly. The leaderboard
remains an empty state while online games are being built. The shared Cards runner optionally starts
Golf on port 3003; Golf uses the existing accounts service without a new game
service. See the repository README for development and hosting details.

## Agreed direction

- Preserve the overall structure and interaction language of Hearts and Euchre.
- Give Golf its own font, light/dark palette, and card back.
- Preview the user's suggested Font Awesome Classic Regular `golf-flag-hole`
  icon as the logo candidate while choosing the new visual identity.
- Offer the existing **Standard** rank-and-suit card design only. Omit the
  illustrated-deck picker and its alternate face assets.
- Share the Cards account and session, including the existing identity and icon.
- Design Golf's playing surface separately when gameplay work begins.

### Visual choices after the initial comparison

- Use Euchre as the base.
- Use the custom thin SVG for large decorative golf marks. Keep the original
  Font Awesome Regular mark and spaced GOLF text in the small navigation brand.
- Use Fraunces for Golf's typography.
- Keep the home logo clear of the menu: 240px on desktop and 200px on phones,
  with the title raised to suit the smaller logo. Standard button labels are 16px.
- Use **bold Fraunces (700) for every button label**, with each word capitalized
  and spaces retained, such as **Play**, **Create Game**, and **Join Game**.
  Use normal letterforms rather than small caps or forced uppercase.
- Use **S6 Sage & Blush Peach**, retaining the Sage & Rose foundation's greens.
- Use the light-theme blush **`#cf9f9c` as the primary accent in both themes**.
  Dark mode must not substitute the lighter peach for the main blush.
- Retain **`#e4b4ad` as a secondary light-peach accent** for highlights, small
  decorative details, and other supporting uses as the site is built.
- Use Argyle for the card back, with larger diamonds and clearer stitching to
  improve its appearance at small sizes.

## Evidence and scope

Reviewed the live sites at `cards.shmem.dev/hearts/` and
`cards.shmem.dev/euchre/`, plus the sibling repositories:

- Hearts: `8da5662`.
- Euchre: `39bddeb`.
- Cards: `36bf5a2`.
- Golf: cloned `git@github.com:shmemcat/golf.git`; starting commit `f8ba252`
  contains only a README.

Live visual checks covered home and rules pages on both sites at desktop and
phone sizes, Hearts' Play choices and desktop create form, and Euchre's phone
sign-in and leaderboard pages. Desktop views used 1440 x 1000 and, for the
initial Euchre home check, 1280 x 720. Phone views used 390 x 844. Euchre's
leaderboard heading was additionally measured at widths 320, 768, and 769.
These checks used the existing dark theme; light palettes were inspected in
source. This was browser viewport testing, not a physical-device test.

An existing Euchre save opened its continue/concede prompt, so its create-form
and unobstructed Play layout were checked in source. No game was started,
continued, or conceded. Signed-in account pages, lobbies, and game screens were
reviewed in source rather than exercised with a live account or game.

## Shared desktop structure

Both sites have the same recognizable framework:

- A centered **1030px** content panel with **20px** rounded corners, **35px**
  padding, and **20px** top/bottom margins. Ordinary content panels have a
  **650px** minimum height; the home menu has its own content-driven height.
- An open, spacious home composition: an oversized decorative logo sits behind
  the game title, with a vertical menu offset to the right beneath it.
- The same home menu, in the same order: **Play, Leaderboard, Rules, About**.
  Desktop menu buttons are **225 x 35px**, separated by **16px**, with rounded
  corners, inset shading, a small shine, and a pressed state.
- A small top bar, rather than a row of navigation destinations. Interior pages
  have the game icon/name on the left; sound/music, theme, and account controls
  occupy the right. Home omits the small game-name link.
- A Cards hub icon in the lower-left corner of the home panel.
- Interior pages repeat the decorative logo/title treatment and centered body.
  Rules use a left section selector beside the text. Play has Create Game and
  Join Game panels side by side. Leaderboards place Monthly and All-Time next
  to one another. Forms and profile content use narrower centered areas.
- Brief fade/vertical-entry transitions, familiar toggle controls, and the same
  Font Awesome icon family.

The home menu's horizontal offset is intentional and visible in both sites.
Keeping it will preserve more of the family resemblance than centering every
element in Golf.

## Mobile behavior and differences

The principal layout breakpoint is **768px** in both projects. Neither adds a
hamburger menu: the small home icon and sound/theme/account controls remain.
The game-name text disappears from the top-left home link.

### Shared behavior

- The outer panel visually disappears into the page background.
- Home menu buttons become **190 x 44px**, retaining the offset composition and
  16px vertical gaps. At 390px, neither home page produced horizontal overflow.
- The logo/title is smaller. Rules navigation moves above the text. Monthly and
  All-Time leaderboards stack vertically, as do profile statistics groups.
- Forms and choices adapt to a single column; content scrolls vertically.

### Hearts

- Keeps a **95vw** wrapper and the inherited 35px horizontal padding. The
  transparent wrapper blends into the body background instead of becoming a
  full-width panel.
- Positions the home composition using **25vh** top spacing, so its vertical
  position changes with phone height. Its mobile menu has a 130px left margin.
- Uses a 106px interior-page logo and a 40px heading, positioned with negative
  margins. The general page layout also mixes Tailwind's 640px breakpoint with
  the stylesheet's 768px breakpoint.
- Play uses flex wrapping; its choices stack at the checked phone width but
  can sit beside one another when there is enough space.
- Fixes the Cards home icon to the phone viewport, including safe-area offsets.
- Between 769px and 1085px, desktop panels shrink to 95vw.

### Euchre

- Uses a **full-width** wrapper with **20px** horizontal padding, no outer
  margin/corner rounding, and a **100dvh** minimum height. At 360px and below,
  horizontal padding drops to 14px.
- Uses **160px** top spacing for the mobile home composition, a 110px menu
  offset, and a 75px offset at 360px and below. This is less dependent on phone
  height than Hearts' home spacing.
- Interior-page titles use a **106px grid overlay** for the logo and text, a
  shared **28px** spacing variable, and fluid heading sizes. Long titles get
  their own size/letter-spacing rule: the leaderboard title fits at 320px.
- Explicitly stacks Play choices below 768px, with a 300px maximum width.
- Keeps the Cards home icon positioned against the home page's container.
  It appears near the viewport bottom on a one-screen home page, but is not
  pinned to the viewport during scrolling.
- Truncates long account names and makes additional adjustments at 360px.
- Below 1050px, overrides desktop panel width to `calc(100% - 40px)`; from
  1051px to 1085px the inherited 95vw rule still applies.

**Recommendation:** use Euchre's current page shell and responsive title/Play
patterns as Golf's starting point, retaining the common home composition.
Choose the hub icon's fixed-versus-container behavior deliberately. Recheck
short phone heights and the 768/769px transition when the new font is installed.

## Visual identities

### Hearts

- **Terminal Dosis**, bundled locally in multiple weights: rounded, narrow sans
  serif with widely spaced uppercase labels.
- Light theme: pale pink background/panel with rose accents and dark brown ink.
- Dark theme: charcoal/slate background and panel with pink text and controls.
- Decorative heart/piping-bag logo and a matching Flourish alternative deck.
- Base body text is 16px, with 1.5px letter spacing; menu labels are compact,
  heavily weighted, and widely tracked.
- The checked desktop rules page left-aligns its article and heading; the phone
  rules text is centered.

### Euchre

- **EB Garamond**, bundled locally with variable roman/italic faces: serif
  typography and small-cap labels give the same structure a different feel.
- Light theme: warm stone/cream, navy ink, dusty rose controls.
- Dark theme: `#111a27` background, `#26364f` panel, cream text, and `#ce9496`
  accents. The main palette is supplied by the later `euchre.css` override.
- Moon/stars logo and an optional Celestial SVG deck.
- Base body text is 18px with 0.8px tracking; ordinary button labels use 16px,
  weight 800, and 1px tracking.
- The checked rules overview centers its heading and paragraphs on desktop as
  well as on the phone, and uses a fanned example hand below the explanation.

For Golf, replace the identity layer while preserving the panel hierarchy,
button treatment, navigation, and page flow. Evaluate the new font at small
card-rank sizes as well as in headings. Its metrics will require spacing
adjustments; copying negative title margins unchanged is unlikely to work.
Keep the font files and license local, following both sister projects.

## Standard cards

Both implementations build Standard faces from a text rank and Font Awesome
suit, rather than a full-deck image asset. Their shared baseline includes:

- Rounded, light faces with a border and subtle shadow.
- A rank above its suit; selection/hover and disabled states.
- A **72 x 100px** base size, **36 x 50px** miniature size, and **90 x 126px**
  large size, before game-layout overrides.
- Corner-positioned labels for ordinary mobile hand cards, with centered labels
  retained in some larger/table variants.

The geometry is similar, but the paint differs. Hearts' Standard faces stay
pale pink with conventional dark/red ink in both themes. Euchre uses cream
faces with navy/rose ink, also retaining light faces in dark mode.

Euchre calls the Standard option `classic` internally; Hearts calls it
`standard`. Golf can have a single rendering path and no style preference.
Reuse the appearance and interaction states, but support all 52 cards: Euchre's
card component imports its 24-card engine's rank/type helpers. Its trump
watermark is game-specific and does not belong in Golf.

A distinct card back is especially visible in Golf's persistent face-down
grids. Create it after choosing the identity, and check that its silhouette,
border, and face/back distinction remain readable at the eventual small size.
The table's final card sizes and label placement are deliberately undecided.

## Shared login and hosting

The current production arrangement is already split: Cards owns accounts;
Hearts and Euchre own their game services. The October 22 cutover receipt and
current code supersede older documents that describe separation as future work.

The natural Golf URL is **`https://cards.shmem.dev/golf/`**, following the live
`/hearts/` and `/euchre/` paths. This is a proposed integration path, not an
existing deployment. The former game subdomains redirect to the hub paths.

The production session is a host-only `__Host-cards_session` HttpOnly cookie
with Path `/`. Serving Golf under the Cards origin lets it participate in that
session directly. An independent `golf.shmem.dev` origin would require a separate
login-sharing design; the current cookie would not simply carry across.

Carry forward:

- `GET /api/account/session` to resolve the user and CSRF token; credentialed
  requests and `X-CSRF-Token` for account mutations.
- The existing account name/icon and focus/pageshow session refresh behavior.
- Hub registration, recovery, and verification links under `/user/?view=...`.
- A game-specific route basename and asset helper, so `/golf/` works for direct
  links, fonts, cards, sounds, and any later worker.
- Independent game data, saves, preferences, statistics, and leaderboard
  ownership. Shared identity does not imply shared preferences: Hearts syncs
  its preferences through its game service, while Euchre's preferences are
  browser-local. Their theme storage keys also differ (`theme` versus
  `cards.theme.v1`). Golf should follow the hub's theme convention deliberately.

Integration work when the application is built:

1. Add Golf to the hub entry links and frontend routing, local development
   runner, and eventual gateway/release configuration.
2. Route its own API/socket traffic independently of the account service.
3. Give its backend a scoped private account-service identity; reuse the public
   identity contract rather than copying users or password storage.
4. Add Golf to account cleanup and readiness coverage. The current deletion
   loop and completion check explicitly enumerate `("hearts", "euchre")`, and
   readiness requires those two peers. A login UI alone will not register Golf
   for deletion of its account-linked game data.
5. Verify login/logout across all games and account cleanup once Golf stores
   account-owned data. No live account or deployment changes were made here.

## Rules constraints for the later game screen

### Family variant approved October 24, 2026

The implementation follows these user-approved changes to the reference below:

- Two standard 52-card decks shuffled together, with 2–6 players.
- Start with two face-up cards in different columns.
- Every other player gets one final turn after someone exposes all six cards.
- Four matching ranks in an adjacent 2×2 block score −20, replacing the two
  columns’ normal zero scores. Score the other two cards normally.
- Keep nine deals and the existing card values and vertical-pair cancellation.

Confirmed for the desktop table on October 24, 2026: six matching cards earn
one −20 block bonus, an exhausted deck reshuffles the discards while retaining
the top discard, and tied lowest totals share the win. A deck draw may be
discarded; a discard-pile draw must be used. The first starter is random, then
the starting seat rotates clockwise each hole.

### Original reference

The [Bicycle reference](https://bicyclecards.com/how-to-play/six-card-golf)
specifies 2-4 players, a 52-card deck, and nine deals. Each player has a two-row,
three-column grid, initially exposing two cards. Players draw from deck or
discard, then replace a grid card or discard their draw. A replaced card stays
face up. A round ends when one player's grid is fully exposed. Lowest total
wins. Aces score 1, twos -2, 3-10 their value, jacks/queens 10, and kings 0;
matching ranks in a column cancel, including paired twos.

This requires persistent grids, a deck/discard area, and a hole scorecard.
The trick-taking table, fanned hand, and Euchre partnership assumptions should
not determine Golf's board. The reference does not specify deck exhaustion or
tie handling, and does not grant an extra final turn to the other players.
The desktop implementation uses the confirmed family defaults above.

## Suggested implementation sequence

1. Carry the selected Fraunces, Sage & Blush Peach palette, Golf Flag Hole logo,
   and enlarged Argyle into the application.
2. Build the familiar home/menu and interior-page shell using Euchre's refined
   responsive layout; add only Standard card faces.
3. Integrate shared identity and Golf's local/hub routes.
4. Settle the remaining rule details, then design and implement the separate
   Golf board for desktop and mobile.

## Source map

Paths below are relative to the sibling repositories, as in local development.

- Layout: `hearts/web/src/styles/containers.module.css`,
  `euchre/web/src/styles/containers.module.css`, both `components/ui/PageLayout.tsx`,
  Hearts `pages/index.tsx`, and Euchre `pages/Home.tsx`.
- Identity and navigation: both `styles/base_style.css`,
  `styles/buttons.module.css`, and `components/Navbar.tsx`; Euchre
  `styles/euchre.css` and `web/src/main.tsx` show the final override order.
- Play/rules/records: both `styles/play-menu.module.css`,
  `styles/leaderboard.module.css`, and their corresponding page components.
- Cards: Hearts `components/game/Card.tsx`, Euchre `components/Card.tsx`, and
  both `styles/card.module.css` and card-preference providers.
- Deferred table patterns: Hearts `components/game/MobileGameTable.tsx`,
  `components/game/Hand.module.css`, and `styles/play.module.css`; Euchre
  `styles/game-board.css` and `styles/multiplayer.css`.
- Accounts: Euchre `lib/account.ts`, `context/AuthContext.tsx`, `pages/User.tsx`;
  Hearts `lib/sharedAccount.ts` and `context/SharedAuthProvider.tsx`.
- Hub: `cards/public/account-client.js`, `public/index.html`,
  `api/cards_accounts/account_sessions.py`, `deletions.py`, `application.py`,
  `game_client.py`, `scripts/dev-split.mjs`, `scripts/split-stack.mjs`, and
  `deploy/split/proxy.conf`.
- Current deployment evidence:
  `cards/release/deployments/split-2026-10-22/README.md`.
