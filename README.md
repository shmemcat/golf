# G O L F

A full-stack, real-time take on Six Card Golf for 2–6 players, with solo bots,
private online tables, achievements, and a responsive UI. Play nine holes;
the lowest total wins.

**Live at [cards.shmem.dev/golf](https://cards.shmem.dev/golf/)**

Part of [Cards](https://cards.shmem.dev/), alongside
[Hearts](https://cards.shmem.dev/hearts/) and
[Euchre](https://cards.shmem.dev/euchre/), with shared accounts and an independent
[Golf game server](api/README.md).

## Features

- **Single-player vs. bots** — play against 1–5 opponents using a fair policy based on visible cards
- **Online multiplayer** — share a six-character room code or invitation link, play as a guest or account holder, and optionally fill empty seats with bots
- **Nine-hole scorecards** — running totals, hole summaries, going-out penalties, and shared wins
- **Hole records** — click the hole badge to revisit completed hands, including the just-finished hole, with arrows, swipe gestures, and carousel dots
- **Achievements & statistics** — 32 badges, tiered milestones, and combined or separate bot/multiplayer statistics
- **Global leaderboards** — Bot and Multiplayer rankings, with monthly and all-time winners
- **Shared accounts** — one Cards sign-in, profile icons, email editing, password recovery, and account deletion
- **Auto-save & resume** — browser saves for guest solo games; persistent rooms and server-verified results for signed-in and online play
- **Sound & music** — card effects, separate volume controls, optional turn sounds, and a shuffled seven-track jazz playlist
- **Animations & responsive design** — opening flips, card flights, compact mobile tables, swipeable boards, and light and dark themes

## Tech Stack

### Frontend

- **React 18 + TypeScript** — UI and guest solo rules engine
- **Vite** — development server and production builds
- **Tailwind CSS 4 + CSS Modules** — styling and responsive layouts
- **React Router 7 + Socket.IO Client** — navigation and live game updates
- **Framer Motion, Howler.js, Radix UI, and Font Awesome Pro** — animations, audio, tooltips, and icons

### Backend

- **Flask + Flask-SocketIO** — REST endpoints and authoritative gameplay over Socket.IO
- **Gunicorn + simple-websocket** — threaded serving and WebSocket support
- **SQLAlchemy + PostgreSQL** — persistent rooms, game results, achievements, and rankings; SQLite for local development
- **Shared Cards accounts service** — identity, sessions, public profiles, and account deletion coordination

### Infrastructure

- **Docker + Nginx** — container builds, static hosting, and gateway routing
- **GitHub Actions + GHCR** — independent, immutable frontend and game-server releases

## Architecture

Guest solo games run in the browser using the TypeScript rules engine and save
locally. Signed-in bot games and all online games use the independent Python
service: the server shuffles and deals, validates moves, runs bots, and records
results. Hidden ranks and deck order stay on the server; clients submit actions
rather than scores.

Golf owns its rooms, timers, results, achievements, and leaderboards. Cards owns
accounts and sessions, which Golf validates through a private service interface.
The production gateway serves the frontend at `/golf/`, forwards `/api/golf/`
to Golf, and routes shared account requests through `/api/account/`. Golf uses
Socket.IO at `/golf/socket.io` with the `/golf` namespace.

See the [game server README](api/README.md) for service configuration, schema
ownership, database permissions, and recovery details.

## House Rules

This is the family's six-card variant, with its own scoring and going-out rules:

- **The table:** 2–6 players, two standard 52-card decks shuffled together, and nine deals called holes.
- **The deal:** six face-down cards per player in two rows of three. Reveal one card in each row, in different columns, without peeking at the others.
- **The turn:** draw from the deck or discard pile. Swap the draw for any grid card, leaving it face up and discarding the old card. A deck draw may be discarded unused; a discard-pile draw must be used.
- **Turn order:** choose the first starting player randomly, then rotate clockwise each hole.
- **Going out:** revealing all six cards gives every other player one final turn, then all grids are revealed and scored.
- **Going-out penalty:** the player who went out must finish the hole with a score lower than every other player's. If another player ties or beats that score, add 10 points to the player who went out. Apply it once, after everyone's final turn.
- **Empty deck:** reshuffle the discards, keeping the top discard in place.
- **Winning:** the lowest total after nine holes wins. Ties share the win.

### Scoring

- **Card values:** aces are 1, twos are −2, kings are 0, jacks and queens are 10, and 3–10 count at face value.
- **Matching columns:** a vertical pair of the same rank scores 0, except paired twos, which score −4.
- **Matching blocks:** four cards of the same rank in an adjacent 2×2 block score −20 instead of the two columns' usual scores. Four twos score −28: their −8 card value plus the −20 bonus. Score the remaining column normally.
- **Six matching cards:** only one block bonus applies, plus the remaining column's score.

The in-app Rules page explains this variant. The general reference is
[Bicycle Six Card Golf](https://bicyclecards.com/how-to-play/six-card-golf).

## Bot Strategy

Golf has no difficulty tiers. Bots compare
the best use of a discard with the expected value of a deck draw, including the
option to discard it. They count currently public ranks, estimate hidden pairs
and adjacent blocks, and look one draw ahead when weighing replacements. They
weigh their own improvement against the points a known discard would give the
next player through an obvious pair or matching 2×2 block. Face-down outgoing
cards use public rank probabilities; bots never peek. Defensive discarding also
applies when choosing a draw pile and stops on the hole's last turn, when nobody
can use the discard. Before going out, bots estimate the 10-point penalty risk
after opponents' final turns. Sunny has an
Easter egg: he stubbornly prioritizes building a matching 2×2 block, preserving
his progress and holding off going out while a block is still possible. He uses
the regular scoring strategy once someone else goes out.

Guest and server bots share decision fixtures and use the same strategy. They
never inspect hidden card identities or deck order. Run a repeatable comparison
against the previous greedy policy with synthetic nine-hole games:

```powershell
uv run --directory api python ../scripts/benchmark-bots.py --games 100
```

## Multiplayer

1. **Create** a private table from Play and choose a capacity of 2–6 players.
2. **Share** the room code or invitation link. Guests enter a name; signed-in players use their Cards identity.
3. **Start** with at least two people. The host can play with just those present or fill the remaining seats with bots.
4. **Play** nine holes, then let the host start another game with the same group.

### Lobbies and Rematches

Hosting passes to the next remaining player when the host leaves. Leave Lobby
lets a player leave a waiting group; only the host can Close Lobby for everyone.
Neither action counts an unstarted game as a result.

Leaving removes that player's seat, including during a game; a bot does not
replace them. The remaining players continue with their current cards and
scores. If fewer than two players remain, everyone sees a notice and the lobby
closes. A lobby also closes when no human players remain.

After the final scores, only the host can choose Play Again. Other players see
“Waiting for host…” with an explanation. Everyone can use Leave Lobby directly
from the final results to return to Play. A multiplayer rematch requires at
least two remaining human players.

### Rejoining and Timeouts

Play offers Continue or Rejoin for unfinished games and waiting lobbies,
including groups between games. Concede and Leave require confirmation before
creating or joining another game. Signed-in bot games have no turn limits,
including starting-card choices and Next Hole.

Signing in from the same browser keeps your waiting-lobby seat and updates it
to your account name and profile icon. Disconnected lobby seats are held for
60 seconds, then freed; returning players can join again if space remains.
If the host's seat expires, hosting passes to the next player. Empty abandoned
lobbies close without recording game results.

In multiplayer, an available decision triggers a sound and shake after
15 seconds, a warning after 9 minutes, and seat removal after
10 minutes. Starting-card choices, draws, replacements, and Next Hole count;
waiting for others or animations does not. Making a move clears the warning.

During a game, disconnected players have two minutes to return. Leaving an active game or
being removed records an abandonment, and a removed seat cannot be reclaimed
during that game. Persistent rooms and clocks survive service restarts.

## Local Development

Install **Node.js 22.12+**, **Python 3.11**, and **uv**. Keep `cards`, `hearts`,
`euchre`, and `golf` as sibling checkouts, then follow
[Cards' local setup](../cards/README.md#run-locally) to install the shared stack's
dependencies. From the Golf repository:

```powershell
npm run web:install
npm run api:install
npm run dev
```

The web installer reads `FONTAWESOME_PACKAGE_TOKEN` from the environment, Golf's
root `.env`, or Euchre's `.env`. Copy `.env.example` if configuring Golf's own
token, and keep it untracked. The installer reuses only the token.

The shared runner starts Cards at **[localhost:3000](http://localhost:3000/)**,
Hearts on **3001**, Euchre on **3002**, and Golf on **3003**. Accounts and game
APIs use **5100–5103**, with Golf on **5103**. Run the shared stack once and use
`localhost` consistently so the account cookie works across ports. Occupied
ports stop startup; **Ctrl+C** stops the processes the runner launched.

Local data and keys stay in `cards/.local/split-dev/`, with Golf's own
`golf.sqlite`. Verification and recovery mail appears in the
[local inbox](http://localhost:3000/__dev/mail/). Existing databases are not
imported and no mail-provider credentials are needed.

`npm run dev:web` starts only Golf's frontend. It expects accounts at
`http://127.0.0.1:5100` and Golf at `http://127.0.0.1:5103`; override
`ACCOUNT_PROXY_TARGET` and `GOLF_API_TARGET` to use different backend addresses.

### Docker Development

With Docker Desktop running:

```powershell
npm run up:build
npm run logs
npm run down
```

This builds a frontend preview at **[localhost:3003](http://localhost:3003/)**
with source reloads. `npm run up` starts the existing image. Accounts and Golf's
API must already be running on host ports 5100 and 5103; account-management links
point to Cards on 3000. Stop the native Golf frontend before using the same port.

The build passes the Font Awesome token through a Docker build secret, and Linux
dependencies stay in a separate volume. Override `GOLF_PORT`,
`ACCOUNT_PROXY_TARGET`, `GOLF_API_TARGET`, or `VITE_CARDS_HOME_URL` in an ignored
`.local/docker.env` file. Container proxy addresses use `host.docker.internal`,
for example:

```dotenv
GOLF_PORT=3004
ACCOUNT_PROXY_TARGET=http://host.docker.internal:5100
GOLF_API_TARGET=http://host.docker.internal:5103
VITE_CARDS_HOME_URL=http://localhost:3000/
```

## Accounts and Saves

Signed-in bot and multiplayer games save their rooms and verified results on
Golf's service. The User dashboard shows combined All Time statistics or
Separate views for Against Bots and Multiplayer, including wins, scores, holes,
win streaks, and matching pairs. Global leaderboards rank completed wins in Bot
and Multiplayer, with monthly UTC and all-time top tens. Guest solo saves remain
in the browser; guest games and layout previews earn no account results.

The account dashboard displays 32 achievement badges. Six of a Kind requires all
six board cards to share a rank at the end of a hole; Deuce Almighty requires a
matching 2×2 block of twos. Other badges cover scoring challenges, comebacks,
close wins, holiday games, and the familiar Geezer,
Night Owl, Early Bird, Better with Friends, Hot Streak, and All Year Round.
A games-finished badge
progresses from bronze Tee Time at 10 completed games to silver Green Jacket at
50 and gold Tour Pro at 100. Golf achievements come from Golf games and settings; they do
not copy achievements earned in Hearts. See the
[service achievement notes](api/README.md#achievements) for unlock rules.

Shared profile icons and email editing live under Profile. Options includes an
opt-in turn-indicator sound saved to the account; theme, sound, and music controls
remain in the navigation bar. Registration, verification, and password recovery
link to Cards, and focusing the app refreshes shared account state.

Delete Account uses the shared, password-confirmed deletion flow. It removes
the Cards account and coordinates game-data cleanup across configured services.
Browser storage belongs to the browser and origin; clearing site data removes
local guest progress.

## Testing

Run from the Golf repository:

```powershell
npm test                  # Frontend rules, game flow, UI, navigation, and accounts
npm run test:api          # Server rules, privacy, persistence, statistics, and achievements
npm run test:accounts     # Shared identity across Cards, Hearts, Euchre, and Golf
npm run test:online       # Real transports, reconnect, service restarts, and deletion
npm run test:release      # Component tags, image records, and release contracts
npm run build             # TypeScript checks and production bundle
```

Frontend tests use Vitest, Testing Library, and jsdom; backend tests use pytest
with disposable databases. `npm --prefix web test` starts frontend watch mode,
and `npm --prefix web run typecheck` checks TypeScript without building.

The account and online integration suites require the sibling dependencies.
They create dedicated `cards/.local/split-*` directories with synthetic accounts
and file-only mail. They do not use production data.

## Releases and Hosting

- **`game-vMAJOR.MINOR.PATCH`** publishes the independent `golf-game-api` image.
- **`web-vMAJOR.MINOR.PATCH`** publishes the `golf-web` frontend image.
- Both publish immutable candidates and source/digest records; publishing alone does not deploy or promote `latest`.
- Frontend builds require the Font Awesome package secret; backend builds do not.

The production bundle defaults to `/golf/`; override `VITE_BASE_PATH` at build
time for another prefix. Serve `web/dist/` beneath that prefix with an
`index.html` fallback for client routes. Fonts, cards, and other assets respect
the base path. `npm run preview` serves the built app on port 3003.

Golf shares Cards' host-only account cookie at `cards.shmem.dev/golf/`. The
Cards gateway routes `/api/account/` to accounts and preserves `/api/golf/`
and `/golf/socket.io` to Golf. A separate subdomain does not share that cookie.

After the reviewed infrastructure activation, `/deploy golf` tests, publishes,
rehearses, and promotes affected components through Cards' release journal with
readiness checks, backups, and rollback. Migrations run as explicit jobs;
service startup never migrates. See Infra's `docs/golf-deployment.md` for operator
procedures, [the service README](api/README.md) for runtime requirements, and
[scripts/rehearse-release.mjs](scripts/rehearse-release.mjs) for production-image
checks in a disposable stack.

## Design Previews

Golf uses Fraunces, the Sage & Blush Peach palette, standard rank-and-suit faces,
a custom thin flag logo, and an Argyle card back. On mobile, two or three
players share a compact table; four to six use swipeable boards. Following the
turn starts enabled, pauses while browsing, and resumes with the bottom checkmark.

`/game/mobile-layouts` compares 2–6-player layouts in an adjustable phone frame,
with draw-placement studies and a live-game toggle. Card, table, and end-game
previews are also available under `/game/`. These studies do not record results.
The [sister-site investigation](docs/sister-site-investigation.md) preserves the
original design brief and comparisons.

## Assets and Credits

Shared components, selected sounds, and layout styles are adapted from Hearts
and Euchre.

- **Fraunces:** [Google Fonts](https://github.com/google/fonts/tree/main/ofl/fraunces), SIL Open Font License; bundled in `web/public/fonts/` with `OFL.txt`.
- **Icons:** the same licensed Font Awesome Pro packages as the sister sites.
- **Golf logo:** editable SVG in `web/public/icons/golf.svg`. The small navigation brand retains the Font Awesome Regular mark.
- **Argyle card back:** native SVG with alternating translucent diamonds, stitching, and a border. Light mode uses tonal sage; dark mode uses forest green. The two palettes fade together with the theme. Regenerate both palettes' regular and miniature assets with `node scripts/generate-card-back.mjs`.
- **Background music:** seven user-supplied tracks by [Alex Morgan](https://pixabay.com/users/alex-morgan-54692529/) in `web/public/sounds/`: “Jazz Cocktail Bar Music” (`backgroundmusic.mp3`), “Jazz Restaurant Music” (556244), “Jazz Dinner Restaurant Music” (556236), “Jazz Bar Restaurant Music” (564253), “Cocktail Jazz” (556233), “Jazz Cocktail Lounge Music” (556246), and “Jazz Rainy Lounge Music” (556235).

Each shuffled music round plays every track once, then reshuffles without
repeating the previous round's last song first. Pausing and resuming music keeps
the current track and rotation.
