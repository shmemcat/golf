# Golf service

Golf owns its rules, random deck, persistent rooms, action receipts, move clock,
results, achievements and global rankings. It has no dependency on the Hearts
or Euchre game servers. All bot opponents use one policy based on visible cards.

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
- `GOLF_DATABASE_URL`: Golf-only PostgreSQL database, or persistent SQLite path.
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
production activation is a separate deployment step.

## Results and recovery

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

Single-player games have no time limits: starting-card choices, every draw and
replacement, and Next Hole all wait for the player, including after reconnecting.
In multiplayer, the opening wait is 90 seconds; an inactive human gets an automatic
move after 60 seconds. Between holes, everyone can select Next Hole; after three
minutes the next hole starts automatically. Explicitly leaving records an abandonment
and lets a bot cover the seat. Rematches require all remaining humans to agree,
and at least two humans for multiplayer. Shared lowest scores count as wins.

Results are unique per game and registered player. The service records the
mode, dates, completion/abandonment, placement, total and hole scores, opponents,
duration, shared wins, pairs, bonus blocks, reveals, draws, swaps, discarded draws
and automatic turns. Account statistics provide combined, bot and multiplayer
aggregates. The global leaderboard ranks completed wins in Bot and Multiplayer,
each with monthly (UTC) and all-time top tens. Current public profiles come from
Cards. Account deletion scrubs room identity, removes results, and leaves a
minimal tombstone to prevent in-flight games restoring deleted statistics.
