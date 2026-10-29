# Golf service

Golf owns its rules, random deck, persistent rooms, action receipts, move clock,
results, achievements and global rankings. It has no dependency on the Hearts
or Euchre game servers. Bot opponents use a policy based on visible cards;
Sunny alone prioritizes chasing matching 2×2 blocks until the final turns.
All bots weigh obvious pairs and blocks their discards could give the next
player, using only visible ranks and public probabilities for face-down cards.

The public API is `/api/golf/*`. Socket.IO uses **`/golf/socket.io`** with
namespace **`/golf`**, and only Golf event names (`golf:subscribe`, `golf:action`,
`golf:state`, `golf:removed`). Both polling and WebSocket upgrades must preserve
that path to this service. Never point either route at Hearts or Euchre.

## Development

Run `uv sync --locked --extra dev` here, then `npm run dev` in the Golf root.
The shared local runner starts this service on 5103 with its own database at
`cards/.local/split-dev/golf.sqlite`, and adds a Golf-only account credential and
deletion callback. Existing account data and service credentials are preserved.

Run `uv run pytest` here, or `npm run test:api` in the Golf root. The root
`npm run test:online` launches disposable local services, creates test accounts,
and checks shared identity, two clients, both transports, independent restarts,
room recovery, statistics separation and account deletion through the real
Cards gateway and Vite proxy. Its data stays in a new `cards/.local/split-*`
directory; it does not read production environment files or send email.

## Service configuration

Required environment:

- `GOLF_SECRET_KEY`: independent random secret of at least 32 characters.
- `GOLF_DATABASE_URL`: PostgreSQL connection scoped to Golf's tables, or persistent SQLite path.
- `CARDS_PUBLIC_URL`: public HTTPS origin, HTTP allowed for local development.
- `CORS_ORIGINS`: comma-separated exact allowed browser origins.
- `CARDS_ACCOUNTS_URL`: private Cards account service origin.
- `CARDS_SERVICE_TOKEN`: dedicated `golf-game` private account credential.
- `CARDS_GAME_ACCOUNT_TOKENS`: JSON object with an independent `golf` callback credential.

Cards must configure an `INTERNAL_CLIENTS` entry `golf-game` with
`sessions.validate` and `profiles.read`, plus a `GAME_SERVICES.golf` peer with
Golf's private URL and matching callback credential. Account deletion waits for
Golf's acknowledgement whenever that peer is configured. Credentials for the
two directions are different; browser clients receive neither one.

Initialize only Golf's tables with `python -m golf_server migrate`, then run
`gunicorn --workers 1 --threads 20 --bind 0.0.0.0:5003 golf_server.wsgi:app`.
Use **one worker and one replica**: this initial service has one room clock and
an in-process mutation gate. Multiple workers require a distributed coordinator
and are not supported. Persist the database across restarts. The included
Dockerfile uses the same command. `/health` identifies `golf-game`; `/ready`
checks Golf's schema. Private `/_internal/*` routes must be blocked at every
public proxy. The Cards rehearsal proxy contains the separate Golf routes;
production activation is a separate reviewed deployment step. Component tags
publish immutable images. Production uses a dedicated `golf_runtime` role in the
existing backed-up Cards schema; it cannot read shared account or other game
tables. Explicit `python -m golf_server.schema upgrade` adopts `golf_002`, upgrading
`golf_001` by adding the settings-achievement table without changing results;
`python -m golf_server.schema check` verifies readiness. Image startup never runs
the migration. `/health` reports the published version and source revision.

## Results and recovery

Room snapshots include per-player `actionTokens`. Commands echo the token for
their action alongside `revision` and `actionId`, using the snapshot displayed
when the player clicked. Tokens track the relevant game, hole, turn, or opening
card selection, so other players' flips, readiness, and connection updates do
not invalidate independent actions. Next Hole stays bound to that player's
completed board while others open the next hole. Duplicate action IDs remain
idempotent; clients without tokens retain the exact-revision check. Never retry
a stale move using a newly fetched token.

Signed-in bot games and online games are server-authoritative. Hidden ranks and
deck order never leave the service. The browser submits actions, not identities
or scores. Commands require Golf CSRF, room membership, the current revision and
an action ID; retries return the same committed result. Account credentials are
revalidated on every socket command. Rooms and clocks survive a service restart.

Guest offline bot games remain local. They do not upload unverifiable browser
scores to global rankings. Online guests can join and play, but earn no account
results. A multiplayer lobby needs at least two humans. By default it starts
with just the people present, reducing the table size; filling empty seats with
bots is an explicit host choice. Leaving a waiting lobby passes hosting to the
next player. Only the host can close it, which ends the room for everyone and
prevents further joins. Neither action records an unstarted game as a result.

When a guest signs in, the signed Golf browser session transfers their waiting
multiplayer lobby seats to the account, including hosting. An existing seat for
that account is merged rather than duplicated. Guest sockets are disconnected
and must reconnect with the account cookies; started games are not transferred.
Lobby membership is kept on the server until explicitly leaving or closing the
lobby. Locking a phone, closing the browser, or losing the network does not remove
a member. The last human explicitly leaving closes a waiting lobby. Hosting passes
to the next member when the host explicitly leaves, including an offline member.
Every departure removes the seat rather than replacing the player with a bot,
including during a game. Boards, scores, turns, final-turn queues, animations,
and readiness follow the remaining players. Lobbies stay open indefinitely while
at least one human remains a member. If only one player remains in a game, they
return to the waiting lobby with the same invite code and the original lobby
capacity. An unfinished game is cancelled for the remaining player without
recording a loss or abandonment. New players can join and start a fresh game.
The lobby closes automatically only when no humans remain; the host can also
close a waiting lobby explicitly.
Finished multiplayer rooms retain their members while offline. Completed results
remain saved, and room cleanup never changes a completed result to abandonment.

Single-player games have no time limits: starting-card choices, every draw and
replacement, and Next Hole all wait for the player, including after reconnecting.
Multiplayer matches Hearts: a sound and shake after 15 seconds of an available
decision, a warning after 9 minutes, and seat removal after 10 minutes.
This applies to starting cards, draws, replacements, and Next Hole while waiting
for that player, whether connected or offline. Disconnects and reconnects neither
shorten nor restart this decision deadline. Moves cancel the
warning; time spent waiting for other players or animations does not count.
Removal records an abandonment, as does explicitly leaving. A removed seat cannot
be reclaimed during that game. Single-player games remain untimed. Rematches require all remaining humans to agree,
and at least two humans for multiplayer. Shared lowest scores count as wins.

Results are unique per game and registered player. The service records the
mode, dates, completion/abandonment, placement, total and hole scores, opponents,
duration, shared wins, pairs, bonus blocks, reveals, draws, swaps, discarded draws
and automatic turns. Account statistics provide combined, bot and multiplayer
aggregates. Only completed games count toward games played, losses, win rate,
and win streaks; active, abandoned, and cancelled games do not affect them. This
also applies to previously saved results. The global leaderboard ranks completed wins in Bot and Multiplayer,
each with monthly (UTC) and all-time top tens. Current public profiles come from
Cards. Account deletion scrubs room identity, removes results and settings
achievements, and leaves a
minimal tombstone to prevent in-flight games restoring deleted statistics.

## Achievements

The account page shows 33 achievement badges. The original eight retain their
names and unlock rules, including Below Zero and Under Par. A single games-finished
badge advances through bronze Tee Time (10 completed games), silver Green Jacket
(50), and gold Tour Pro (100); abandoned games do not advance it.

Birdie and Eagle require exactly -1 and -2 on a hole. Hole in One requires all
three columns matched on the same completed hole. Six of a Kind requires all six
board cards to share one rank at the end of a hole; suits do not matter, and it
does not change scoring or add a block bonus. Deuce Almighty requires an adjacent
2×2 block of twos at the end of a hole, in either pair of neighboring columns.
Six twos also qualify; the existing block and board scores remain unchanged.
Don't Quit Your Day Job requires exactly 70 on one hole, including the existing
10-point going-out penalty on a 60-point board. It is a secret achievement until
earned, and recorded finished-hole scores qualify retrospectively. A total of
70 spread across multiple holes does not qualify.
Up and Down requires consecutive
positive then negative holes in one game. Out of the Rough requires a win after
being last (including tied last, but not an all-player tie) after eight holes.
Photo Finish requires an outright win by one point, and Sunday Best a completed
total of -18 or lower. Recorded hole achievements survive abandoning the game;
whole-game achievements require completion.

The eight Hearts holidays use the same names and dates, including Gregorian
Easter and US Thanksgiving. They unlock for a finished game whose start was on
the holiday in that player's local time. The browser sends its JavaScript UTC
offset in `X-Golf-UTC-Offset`; Golf validates and stores it per seat, then in the
result. Older results without an offset use their recorded UTC start. Existing
scores and dates automatically qualify for the new retrospective awards; the
three-column, six-matching-card, matching-twos-block, and final-hole comeback facts
are recorded for new holes/results. Historical results without board facts are
not used to infer Six of a Kind or Deuce Almighty.

Night Owl requires completing a game started between midnight and 5 a.m.; Early
Bird uses 5 a.m. through just before 8 a.m. Both use the player's recorded local
start time. Better with Friends requires a completed multiplayer game that
started with at least two humans. Hot Streak requires five consecutive wins
(shared wins count), and stays earned after a later loss; abandoned games leave the
streak unchanged. All Year Round requires all eight holiday badges, across any number of years.

Geezer unlocks when a signed-in player turns music off or moves the music slider
to zero while music is on. An initially disabled music setting and muting sound
effects do not unlock it. `POST /api/golf/achievements` accepts only `geezer`,
requires the account cookie, Golf CSRF and allowed origin, and stores one unlock
per account. The badge refreshes after saving, survives browser/device changes,
and is removed on account deletion. Before running this version, apply the
schema upgrade and updated `deploy/grants.sql` as the database owner.
All achievements belong to Golf results and do not copy a Hearts player's unlocks.

Six of a Kind and Don't Quit Your Day Job also recognize operator-granted
`six_of_a_kind` and `dont_quit_your_day_job` rows in the existing
`golf_achievement_unlocks` table. A grant belongs to the account, appears
in all statistics views, and is removed on account deletion. This uses `golf_002`
without another migration. The public achievements endpoint still accepts only
`geezer`; players cannot grant themselves gameplay achievements.
# Achievement schema rollout

This release adopts `golf_002` and adds `golf_achievement_unlocks`. Deploy the
dedicated compatibility image from the preceding production code first. During
the explicit maintenance procedure, stop admission and writers, take a fresh
backup, migrate with the schema owner, and grant CRUD on the new table only to
`golf_runtime`. Resume and verify the compatible image before promoting the final
`golf_002` release. Runtime credentials never migrate, and rollback preserves
the additive schema and earned unlocks.
