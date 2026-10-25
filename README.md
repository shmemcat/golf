# Six Card Golf

The next sister game to Hearts and Euchre, sharing accounts with
[Cards](https://cards.shmem.dev/).

## Play

The React app in `web/` uses Euchre’s responsive shell with Fraunces,
the Sage & Blush Peach palette, a thin custom golf flag logo, and a large Argyle
card back. Buttons use bold, mixed-case labels. Only the standard rank/suit
card faces are included.

Home, play/setup menus, rules, about, sign-in, and profile pages are
implemented. Create Game starts a local game against 1–5 bots. The
table supports 2–6 seats, animated opening flips, deck/discard draws, swaps,
final turns, and a nine-hole scorecard. Every opponent uses the same bot policy,
based only on exposed cards and public draws. Bots recognize pairs and adjacent
four-card bonuses, use helpful discards, and discard unwanted deck draws.
Round summaries carry totals through all nine holes; final scores show the
winner or shared winners, with Play Again starting a fresh game of the same size.
Online play uses private room codes, with optional bots in empty seats. After
the final results, the host can start a new game
for everyone. Other players see “Waiting for host…” with a tooltip explaining
that only the host can start a new game. If the host leaves, hosting passes to
the next remaining player. Golf has
its own multiplayer service and socket at `/golf/socket.io` (`/golf` namespace).
Signed-in bot games and multiplayer games save server-verified account results.
The global leaderboard has Bot and Multiplayer tabs, each with monthly and
all-time winners. Profile statistics offer All Time and Separate views, with
Against Bots and Multiplayer categories. On mobile,
two or three players share a compact table; four to six use swipeable boards.
The approved mobile layout is automatic in regular play: boards stay centered,
your drawn card sits beside you, and the three-player opponents draw below their
boards. In two-player games, both players have room for a draw at the side.
Following the turn starts enabled, pauses when you browse, and resumes with the
bottom checkmark. The piles, turn hint, and next player stay visible; draws and
discards to other boards fade at the screen edges. The play area stays at the
top and cycling controls stay at the bottom of the usable viewport. Guest games save
their table and animations in this browser; signed-in bot and online games reconnect
to their saved room. Play offers Continue or Rejoin for unfinished games and waiting
lobbies, including online groups between games. Concede and Leave require confirmation
before a new game can be created or joined.

`/game/mobile-layouts` compares 2–6-player tables in a phone frame,
starting at a 412×748 usable viewport based on the supplied S24 Ultra screenshot.
The dimensions are adjustable for display zoom and browser chrome. The two- and
three-player studies compare a centered board with the draw beside it, a draw
below the boards, and a third slot beside the piles. A toggle shows the same
sample hand with and without a draw; Drawing player and Replay draw show each
opponent's draw placement and flight. Another toggle enables a live game. Four to six
players always use cycled boards. The study alternatives remain in the preview;
Create Game and live preview games use the approved layout.

## House rules

Golf uses the family variant confirmed on October 24, 2026:

- Shuffle two standard 52-card decks together (104 cards), for 2–6 players.
- Each player has two rows of three cards. Turn one starting card face up in
  each row, in different columns.
- After someone reveals all six cards, every other player gets one final turn.
- A matching vertical pair scores zero, except paired twos, which score −4.
- Four cards of the same rank in an adjacent 2×2 block score −20 instead of
  the two matching columns’ usual scores, except four twos, which score −28
  (−8 in card values plus the −20 block bonus). Score the remaining two cards normally.
- Play nine deals; the lowest total wins.
- Choose the first starting player randomly, then rotate clockwise each hole.
- A deck draw may be discarded; a discard-pile draw must be used.
- Reshuffle an exhausted deck from the discards, retaining the top discard.
- Tied lowest totals share the win. Six matching ranks earn one −20 block bonus.

## Local development

Requires Node 22.12+, the sibling `cards`, `hearts`, and `euchre` checkouts,
and their existing split-stack dependencies. Run from this directory:

```sh
npm run web:install
npm run api:install
npm run dev
```

The installer uses `FONTAWESOME_PACKAGE_TOKEN` from the environment, Golf’s
`.env`, or the existing Euchre `.env`. It reads only that token and never copies
the credential into this repository.

The shared runner starts Cards at `http://localhost:3000/`, Hearts at `3001`,
Euchre at `3002`, and Golf at `3003`. It uses isolated local data and an email
inbox at `http://localhost:3000/__dev/mail/`. Use `localhost` consistently so the
session cookie works across ports. The runner refuses to replace a service
already using one of those ports. Golf’s independent Python service runs on
5103 and keeps its own `golf.sqlite` in the isolated stack directory. See
[the service README](api/README.md) for its account boundary and deployment
configuration. No deployment is performed by the development runner.

If the accounts service is already running, `npm run dev:web` starts just Golf.
Its default account proxy targets `http://127.0.0.1:5100`; set
`ACCOUNT_PROXY_TARGET` to use another local accounts address. Its separate
Golf proxy targets `http://127.0.0.1:5103`; set `GOLF_API_TARGET` to change it.

### Docker development

With Docker Desktop running, use `npm run up:build` to build and start Golf at
`http://localhost:3003/`. Source changes reload automatically. `npm run up`
starts the existing image, `npm run logs` follows its output, and `npm run down`
stops it. The container binds only to this computer.

The build reuses the Font Awesome token through a Docker build secret, using
the same environment or `.env` lookup as the web installer. It is not copied
into the image. Linux dependencies stay in a separate Docker volume.

This starts only Golf's frontend. Shared login uses the existing Cards accounts
service at host port 5100, Golf’s service uses host port 5103, and
account-management links use Cards at port 3000.
For other ports, set `GOLF_PORT`, `ACCOUNT_PROXY_TARGET`, `GOLF_API_TARGET`, and
`VITE_CARDS_HOME_URL` in an ignored `.local/docker.env` file, for example:

```dotenv
GOLF_PORT=3004
ACCOUNT_PROXY_TARGET=http://host.docker.internal:5100
VITE_CARDS_HOME_URL=http://localhost:3000/
```

```sh
npm test                  # Rules, game flow, table UI, navigation, shared accounts
npm run test:accounts     # Real disposable accounts across all four sites
npm run test:api          # Server rules, privacy, actions, account results
npm run test:online       # Two accounts, independent sockets, reconnect, deletion
npm run build             # TypeScript + production bundle
```

The integration check requires the sister-site dependencies and writes only
to a dedicated `Cards/.local/split-golf-accounts-*` directory. Verification mail
stays in its local outbox.

## Hosting and shared accounts

The production bundle defaults to `/golf/`; override `VITE_BASE_PATH` at build
time for another prefix. Serve `web/dist/` under that prefix and fall back to
its `index.html` for client routes. Fonts, cards, and other assets respect the
prefix. `npm run preview` serves the build locally at port 3003.

Account requests use `/api/account` by default, cookie credentials, and fresh
CSRF tokens. Login, logout, email editing, and the full shared profile icon
catalog use Cards’ existing service. Registration, verification, recovery, and
account management link to Cards. Focus refreshes account state after visiting
a sister site.

Signing in opens `/profile`, which shows Golf statistics and eight achievement
badges in the sister sites’ style, alongside profile icon and email editing.
The username button opens the profile; `/options` redirects there. Theme and
audio controls remain in the navigation bar.
The profile’s red Delete Account button uses the sister sites’ two-step,
password-confirmed shared-account deletion flow. A successful deletion clears
that account’s local Golf results and returns to sign-in.

Completed nine-hole solo games are stored per account in this browser, matching
Euchre’s local solo-results approach. Statistics include games played and won,
win rate, holes played, best and average total, best hole, and negative holes.
Lowest totals win, including ties. Badges reward finishing, winning, ten wins,
negative holes, a zero hole, a negative game total, nine nonpositive holes, and
a six-player win. Guest games, unfinished games, and layout previews do not
count. Switching accounts during a game prevents it from being credited to
either account. Play Again creates a fresh result identity, and a failed save
offers a retry in the final-score dialog. Results do not sync between devices.

Production should host Golf on `cards.shmem.dev/golf/` alongside its sister
sites, keeping the shared account cookie on the same host. A new subdomain
alone does not share the existing host-only cookie. The Cards gateway must
continue to route `/api/account/` to the accounts service.

Component tags (`game-v*` and `web-v*`) publish the production images. After the
reviewed infrastructure activation, `/deploy golf` tests and publishes affected
components and promotes immutable digests through Cards' release journal, with
readiness checks, backups and rollback. Runtime startup never runs migrations.
See Infra's `docs/golf-deployment.md` for the one-time activation and
`scripts/rehearse-release.mjs` for disposable production-image checks.

## Design and credits

The [sister-site investigation](docs/sister-site-investigation.md) records the
layout comparisons and approved design. Shared components, selected sounds,
and layout styles are adapted from the user’s Euchre and Hearts projects.

- Fraunces: [Google Fonts](https://github.com/google/fonts/tree/main/ofl/fraunces),
  SIL Open Font License; bundled in `web/public/fonts/` with `OFL.txt`.
- Icons: the same licensed Font Awesome Pro packages as the sister sites.
- Large golf logo: editable SVG in `web/public/icons/golf.svg`. The small
  navigation brand retains the original Font Awesome Regular mark.
- Background music: seven user-supplied tracks by Alex Morgan, stored in
  `web/public/sounds/`: “Jazz Cocktail Bar Music” (`backgroundmusic.mp3`),
  “Jazz Restaurant Music” (556244), “Jazz Dinner Restaurant Music” (556236),
  “Jazz Bar Restaurant Music” (564253), “Cocktail Jazz” (556233),
  “Jazz Cocktail Lounge Music” (556246), and “Jazz Rainy Lounge Music” (556235).
  Each shuffled round plays every track once, then reshuffles without repeating
  the previous round’s last song first. The music toggle pauses and resumes
  the current track without resetting the rotation.
- Argyle card back: native SVG preserving the approved preview’s translucent
  diamonds, stitching, and border. Regenerate the regular and miniature assets
  with `node scripts/generate-card-back.mjs`.

Rules reference: [Bicycle Six Card Golf](https://bicyclecards.com/how-to-play/six-card-golf).
