# Six Card Golf

The next sister game to Hearts and Euchre, sharing accounts with
[Cards](https://cards.shmem.dev/).

## First stage

The React app in `web/` uses Euchre’s responsive shell with Fraunces,
the Sage & Blush Peach palette, a thin custom golf flag logo, and a large Argyle
card back. Buttons use bold, mixed-case labels. Only the standard rank/suit
card faces are included.

Home, play/setup menus, rules, about, account, profile, and options pages are
implemented. The leaderboard has an empty state. Create and join explain that
games are coming soon; no game screen, game API, results, or statistics are
implemented yet.

## Local development

Requires Node 22.12+, the sibling `cards`, `hearts`, and `euchre` checkouts,
and their existing split-stack dependencies. Run from this directory:

```sh
npm run web:install
npm run dev
```

The installer uses `FONTAWESOME_PACKAGE_TOKEN` from the environment, Golf’s
`.env`, or the existing Euchre `.env`. It reads only that token and never copies
the credential into this repository.

The shared runner starts Cards at `http://localhost:3000/`, Hearts at `3001`,
Euchre at `3002`, and Golf at `3003`. It uses isolated local data and an email
inbox at `http://localhost:3000/__dev/mail/`. Use `localhost` consistently so the
session cookie works across ports. The runner refuses to replace a service
already using one of those ports. Golf has no Python service at this stage.

If the accounts service is already running, `npm run dev:web` starts just Golf.
Its default account proxy targets `http://127.0.0.1:5100`; set
`ACCOUNT_PROXY_TARGET` to use another local accounts address.

```sh
npm test                  # Navigation, rules, shared-account client and UI
npm run test:accounts     # Real disposable accounts across all four sites
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

Production should host Golf on `cards.shmem.dev/golf/` alongside its sister
sites, keeping the shared account cookie on the same host. A new subdomain
alone does not share the existing host-only cookie. The Cards gateway must
continue to route `/api/account/` to the accounts service. No production
deployment, gateway configuration, or public hub listing is included here.

## Design and credits

The [sister-site investigation](docs/sister-site-investigation.md) records the
layout comparisons and approved design. Shared components, selected sounds,
and layout styles are adapted from the user’s Euchre and Hearts projects.

- Fraunces: [Google Fonts](https://github.com/google/fonts/tree/main/ofl/fraunces),
  SIL Open Font License; bundled in `web/public/fonts/` with `OFL.txt`.
- Icons: the same licensed Font Awesome Pro packages as the sister sites.
- Large golf logo: editable SVG in `web/public/icons/golf.svg`. The small
  navigation brand retains the original Font Awesome Regular mark.
- Background music: “Jazz Cocktail Bar Music” by Alex Morgan; user-supplied
  MP3 stored as `web/public/sounds/backgroundmusic.mp3`.
- Argyle card back: native SVG preserving the approved preview’s translucent
  diamonds, stitching, and border. Regenerate the regular and miniature assets
  with `node scripts/generate-card-back.mjs`.

Rules reference: [Bicycle Six Card Golf](https://bicyclecards.com/how-to-play/six-card-golf).
