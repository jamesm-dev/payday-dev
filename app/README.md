# Payday

What is safe to spend until payday, and when the loans end. A personal budgeting app for one owner
who is paid every two weeks: an installable web app for the phone and the laptop.

The plan lives in [`../.idea/`](../.idea/): [`SPECS.md`](../.idea/SPECS.md) for what and why,
[`ROADMAP.md`](../.idea/ROADMAP.md) for the phases. Phases 0 to 3 are built; production has not
been deployed yet.

## What it does

- **Safe to spend** on the home screen: your balance, less every bill and loan payment due before
  the next payday, less a share of each quarterly and yearly bill. It warns when the balance is
  older than the last payday.
- **First-run setup** for pay, balance, bills and loan payments, and a **schedule** where each can
  be edited, ended, or skipped or changed for one payment.
- **Next paychecks** (`/plan`): what each of the next six paychecks has to cover. Tap **Paid** on a
  bill once it is paid; the next check-in starts with it ticked, and the number does not move until
  then.
- **Paycheck list**: each paycheck downloads as a text file, a PDF or a Word document, in the
  owner's own format — the pay, a rule, the bills in the owner's groups with `*` on the optional ones
  and `/` on the paid ones, then three totals. A bill's group and optional mark are set on its
  schedule page.
- **Payday check-in** (`/checkin`): did the pay land, what is in the account, what was spent, did
  each payment go out, and what is owed on each loan. Past check-ins are at `/checkin/history`.
- **Loans** (`/loans`): credit cards, loans with fixed payments, buy-now-pay-later plans and money
  owed to a person, with the total owed, the interest a month costs, and the debt-free date at the
  current payments. A loan that never pays off at its pace says so, and an unknown rate is shown as
  unknown. A card's purchases count as spending at the check-in. The total owed at each check-in is
  listed, newest first.
- **Payday reminders**: a push notification and a calendar file (`/calendar.ics`).
- **Sign-in** for the one owner with a password, and optionally each device's own PIN, fingerprint or
  face (a passkey). Recovery codes cover a forgotten password.

A loan's payments are its schedule item, so each payment is counted once in the safe-to-spend
number. Not built yet: payoff strategies, bank imports, categories.

## Prerequisites

- **Node.js 26.13.0**, pinned in [`.nvmrc`](.nvmrc). With nvm: `nvm install 26.13.0` then
  `nvm use 26.13.0`.
- **pnpm 12.16.1**, pinned in `package.json`. Node 26 does not include corepack, so install it with
  npm: `npm install -g pnpm@12.16.1`.
- **git**. Docker is not needed for development.

## Set up and run

From the repository root:

```sh
cd app
pnpm install          # also points git at ../.githooks
pnpm dev              # http://localhost:5173
```

The first request creates `local.db` and runs the migrations. Without a `.env`, development uses
`local.db`; copy [`.env.example`](.env.example) to `.env` to change it.

### First sign-in

Open the app and choose a password (12 characters or more). In development no setup code is needed: the first
person to register becomes the owner, and there is never a second. Save the recovery codes it shows.
Then the app walks you through setup (currency, pay, balance, bills, loan payments).

### Demo data

`pnpm seed` loads a fictional household (pay, bills, a credit card, a car loan, a laptop plan and a
loan from Dad) into the database at `DATABASE_URL` (default `local.db`). Register first, since the
seed needs an owner. It refuses if a schedule already exists (`pnpm seed --force` adds it anyway)
and always refuses when `NODE_ENV=production`.

## Environment variables

Declared in [`src/env.ts`](src/env.ts); [`.env.example`](.env.example) lists them with empty values.
Every one is optional at build time, and checked where it is used.

| Variable                 | What it is for                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | Path to the SQLite file. Required to run the server. In development `local.db` is the default                   |
| `OWNER_SETUP_CODE`       | One-time code to register the first owner in production. Unset, production refuses. Development needs none      |
| `VAPID_PUBLIC_KEY`       | Public half of the Web Push key pair. Make the pair once with `npx web-push generate-vapid-keys`                |
| `VAPID_PRIVATE_KEY`      | Private half. A secret. With the other two unset or incomplete, reminders are off and the settings page says so |
| `VAPID_SUBJECT`          | A `mailto:` or `https://` address a push service can reach you on                                               |
| `LITESTREAM_METRICS_URL` | Litestream's metrics endpoint, for the backup age on `/health`. Leave empty locally                             |
| `MANAGEMENT_DIR`         | Where the development-only `/management` dashboard reads its state. Defaults to `../.management`                |

The container also reads `REPLICA_BUCKET`, `REPLICA_ENDPOINT`, `REPLICA_REGION`,
`LITESTREAM_ACCESS_KEY_ID` and `LITESTREAM_SECRET_ACCESS_KEY` (Litestream, not the app). The Node
server itself takes `HOST`, `PORT`, `ORIGIN` and `PROTOCOL_HEADER` from adapter-node. Reminders are
only accepted from the real push services (Chrome and Android, Safari and iPhone, Firefox, Windows).

## Test

Run from `app/`:

| Command                                                   | What it does                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm e2e:browsers`                                       | Downloads Chromium and WebKit for the browser tests. Once per machine          |
| `pnpm test:unit`                                          | Vitest: the engine, the data layer, auth, reminders, and the performance check |
| `pnpm test:e2e`                                           | Playwright against the production build, at iPhone, Android and laptop sizes   |
| `pnpm test`                                               | Both                                                                           |
| `pnpm vitest run src/lib/domain/loans.test.ts`            | One unit test file                                                             |
| `pnpm playwright test tests/home.e2e.ts --project=iphone` | One browser test, one device                                                   |

Both runners write JUnit reports to `reports/`. Test names carry their task id (`TSK-…`) from
`.idea/epics/`.

The Playwright projects share **one** server and **one** in-memory database, so they run in order:

1. `setup` registers the owner with a password, adds an optional passkey on Chromium, and saves the
   session.
2. `journey` (iPhone) runs first-run setup and the schedule edits.
3. `checkin` (iPhone, WebKit) runs check-ins and reminders.
4. `loans` (iPhone) adds loans and runs check-ins with the loans step.
5. `iphone`, `android` and `laptop` then read the finished household and change nothing that
   outlives their own test.

A file that changes the database belongs in one of the first four; each ends by putting the
household back as the next expects it.

## Other commands

Run from `app/`:

| Command                                   | What it does                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm lint`                               | Prettier and ESLint                                                     |
| `pnpm format`                             | Prettier, writing fixes                                                 |
| `pnpm check`                              | svelte-check, plus the service worker against its WebWorker types       |
| `pnpm build`                              | Production build into `build/`; needs no database                       |
| `pnpm start`                              | Runs the build. Needs `DATABASE_URL`                                    |
| `pnpm seed`                               | Loads the fictional demo household                                      |
| `pnpm db:generate`                        | A new SQL migration from `src/lib/server/db/schema.ts`, into `drizzle/` |
| `pnpm db:generate --custom --name <name>` | An empty migration for hand-written SQL                                 |
| `pnpm icons`                              | Regenerates the PNG icons from `src/lib/assets/favicon.svg`             |

There is no `db:push`: every schema change is a checked-in migration, applied when the server
starts.

## Structure

```
app/
  src/
    lib/
      domain/               the pure engine: no database, no framework, no floats
        money.ts dates.ts   integer minor units; calendar dates with no time zone
        schedule.ts         repeat rules and their occurrences (expand)
        periods.ts          paydays and paycheck periods
        safeToSpend.ts      the number (ADR-0009)
        plan.ts checkin.ts  the next paychecks; the check-in arithmetic
        paycheckList.ts     one paycheck as the owner's list: groups, marks, totals
        loans.ts            interest, payoff projection, debt-free date, expected balances
        fixture.ts          the fictional household the tests and the seed share
      server/               server-only (SvelteKit refuses to send it to the browser)
        money/              reading and writing money: store, checkin, loans, and the views
        auth/ reminders/    password, passkeys and sessions; push, calendar file and the daily job
        export/             the list as a text file, a PDF and a Word document, no dependencies
        db/                 schema, open-and-migrate, the one connection
      loans/ schedule/ ...  Svelte components and words shared by pages
      styles/               tokens.css (every colour, size and space) and controls.css
    routes/                 pages and endpoints; +page.server.ts loads on the server
      loans/                the ledger, add a loan, edit a loan
      checkin/ plan/ schedule/ settings/ setup/ signin/ ...
    service-worker/         caches the app shell; never caches pages
    hooks.server.ts         startup migration, sign-in guard, request ids, error handling
  drizzle/                  SQL migrations, checked in
  scripts/seed.ts           the demo household
  tests/                    Playwright
  Dockerfile  fly.toml  litestream.yml  scripts/start.sh   production
  docs/restore-drill.md     how a backup is proven
```

Imports inside the app use `#lib/...` with the file extension, such as
`import { getDb } from '#lib/server/db/index.ts'`. SvelteKit 3 removed `$lib`. Files in
`domain/`, and the files the seed script reaches, import each other relatively with `.ts` too, so
Node can run `scripts/seed.ts` directly.

All money is whole minor units and rates are basis points; rounding happens once per interest
period, half up. The convention is written at the top of `src/lib/domain/loans.ts`.

## Production

One Fly.io machine with a volume at `/data`, Litestream in the same container replicating the
database to object storage, deployed by CI on every push to `main` once `FLY_API_TOKEN` is set.
None of it exists yet: `/ship` creates it. Set `OWNER_SETUP_CODE` and the three `VAPID_*` values as
Fly secrets before the first sign-in. The machine must not auto-stop, or the reminder job never
runs. Migrations run when the server starts. Secrets live in Fly, never in this repository.
