# Payday

What is safe to spend until payday, and when the loans end. A personal budgeting app for one owner
who is paid every two weeks: an installable web app for the phone and the laptop.

The plan lives in [`../.idea/`](../.idea/): [`SPECS.md`](../.idea/SPECS.md) for what and why,
[`ROADMAP.md`](../.idea/ROADMAP.md) for the phases. Production is Netlify and Supabase; see
[Production](#production). It has not been deployed yet.

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
- **Payday reminders**: a calendar file (`/calendar.ics`) with every payday for the next year, each
  with an alarm at the time you choose. Open it on your phone or computer and your calendar does the
  reminding. Nothing is pushed from the server.
- **Sign-in** for the one owner with a password, and optionally each device's own PIN, fingerprint or
  face (a passkey). Recovery codes cover a forgotten password.

A loan's payments are its schedule item, so each payment is counted once in the safe-to-spend
number. Not built yet: payoff strategies, bank imports, categories.

## Prerequisites

- **Node.js 26.13.0** for development, pinned in [`.nvmrc`](.nvmrc). With nvm: `nvm install 26.13.0`
  then `nvm use 26.13.0`. Production runs Node 24 (see [Production](#production)); the app works on
  both, and `engines` allows `>=24 <27`.
- **pnpm 12.16.1**, pinned in `package.json`. Node 26 does not include corepack, so install it with
  npm: `npm install -g pnpm@12.16.1`.
- **git**. Docker is not needed.

## Set up and run locally

From the repository root:

```sh
cd app
pnpm install          # also points git at ../.githooks
pnpm dev              # http://localhost:5173
```

Development needs no database server and no `.env`. With `DATABASE_URL` empty, the first request
creates a local Postgres in the folder `.pglite/` (PGlite, Postgres running inside the process) and
runs the migrations. Delete `.pglite/` to start from nothing. It belongs to one process at a time, so
stop `pnpm dev` before running `pnpm seed`. Copy [`.env.example`](.env.example) to `.env` only to
change something.

### First sign-in

Open the app and choose a password (12 characters or more). In development no setup code is needed: the first
person to register becomes the owner, and there is never a second. Save the recovery codes it shows.
Then the app walks you through setup (currency, pay, balance, bills, loan payments).

### Demo data

`pnpm seed` loads a fictional household (pay, bills, a credit card, a car loan, a laptop plan and a
loan from Dad) into the database at `DATABASE_URL` (default `.pglite/`). Register first, since the
seed needs an owner. It refuses if a schedule already exists (`pnpm seed --force` adds it anyway)
and always refuses when `NODE_ENV=production`.

## Environment variables

Declared in [`src/env.ts`](src/env.ts); [`.env.example`](.env.example) lists them with empty values.
Every one is optional at build time, and checked where it is used.

| Variable                 | What it is for                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | Where the data lives. Production: Supabase's transaction pooler (port 6543). Empty in development: `.pglite/`. `memory://`: the tests |
| `DATABASE_MIGRATION_URL` | Used only by `pnpm db:migrate`, in the deploy's build: Supabase's session pooler (port 5432). Falls back to `DATABASE_URL` when unset |
| `DATABASE_CA_CERT_PATH`  | Optional. A CA certificate to verify the database against. A Supabase host needs none                                                 |
| `OWNER_SETUP_CODE`       | One-time code to register the first owner in production. Unset, production refuses. Development needs none                            |
| `MANAGEMENT_DIR`         | Where the development-only `/management` dashboard reads its state. Defaults to `../.management`                                      |

## Test

Run from `app/`:

| Command                                                   | What it does                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm e2e:browsers`                                       | Downloads Chromium and WebKit for the browser tests. Once per machine                  |
| `pnpm test:unit`                                          | Vitest: the engine, the data layer, auth, the calendar file, and the performance check |
| `pnpm test:e2e`                                           | Playwright against a production build, at iPhone, Android and laptop sizes             |
| `pnpm test`                                               | Both                                                                                   |
| `pnpm vitest run src/lib/domain/loans.test.ts`            | One unit test file                                                                     |
| `pnpm playwright test tests/home.e2e.ts --project=iphone` | One browser test, one device                                                           |

Both runners write JUnit reports to `reports/`. Test names carry their task id (`TSK-…`) from
`.idea/epics/`.

The browser tests build the app with `PAYDAY_ADAPTER=node` (set by `playwright.config.ts`) and run it
as a plain Node process, because Netlify's functions cannot be started by a test. It is the same
server code as production; only the entry point differs. A plain `pnpm build` makes the Netlify
output.

The Playwright projects share **one** server and **one** in-memory database, so they run in order:

1. `setup` registers the owner with a password, adds an optional passkey on Chromium, and saves the
   session.
2. `journey` (iPhone) runs first-run setup and the schedule edits.
3. `checkin` (iPhone, WebKit) runs check-ins and the reminder time.
4. `loans` (iPhone) adds loans and runs check-ins with the loans step.
5. `iphone`, `android` and `laptop` then read the finished household and change nothing that
   outlives their own test.

A file that changes the database belongs in one of the first four; each ends by putting the
household back as the next expects it.

## Other commands

Run from `app/`:

| Command                                   | What it does                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm lint`                               | Prettier and ESLint                                                                            |
| `pnpm format`                             | Prettier, writing fixes                                                                        |
| `pnpm check`                              | svelte-check, plus the service worker against its WebWorker types                              |
| `pnpm build`                              | The Netlify build: static files in `build/`, the function in `.netlify/v1/`. Needs no database |
| `pnpm test:netlify`                       | After `pnpm build`: calls the built Netlify function and checks headers and redirects          |
| `pnpm db:migrate`                         | Applies the checked-in migrations to a Postgres (the deploy runs it)                           |
| `pnpm seed`                               | Loads the fictional demo household                                                             |
| `pnpm db:generate`                        | A new SQL migration from `src/lib/server/db/schema.ts`, into `drizzle/`                        |
| `pnpm db:generate --custom --name <name>` | An empty migration for hand-written SQL                                                        |
| `pnpm icons`                              | Regenerates the PNG icons from `src/lib/assets/favicon.svg`                                    |

There is no `db:push`: every schema change is a checked-in migration. A local database applies them
as it opens; Supabase gets them from the deploy's build.

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
        auth/ reminders/    password, passkeys and sessions; the calendar file and its time
        export/             the list as a text file, a PDF and a Word document, no dependencies
        db/                 schema, opening the database, the one connection
      loans/ schedule/ ...  Svelte components and words shared by pages
      styles/               tokens.css (every colour, size and space) and controls.css
    routes/                 pages and endpoints; +page.server.ts loads on the server
      loans/                the ledger, add a loan, edit a loan
      checkin/ plan/ schedule/ settings/ setup/ signin/ ...
    service-worker/         caches the app shell; never caches pages
    hooks.server.ts         opens the database, sign-in guard, security headers, request ids
  drizzle/                  SQL migrations, checked in
  scripts/migrate.ts        pnpm db:migrate, run by the deploy's build
  scripts/seed.ts           the demo household
  tests/                    Playwright
  netlify.toml              the Netlify build settings
```

Imports inside the app use `#lib/...` with the file extension, such as
`import { getDb } from '#lib/server/db/index.ts'`. SvelteKit 3 removed `$lib`. Files in
`domain/`, and the files the seed and migrate scripts reach, import each other relatively with `.ts`
too, so Node can run them directly.

All money is whole minor units and rates are basis points; rounding happens once per interest
period, half up. The convention is written at the top of `src/lib/domain/loans.ts`.

## Production

Payday runs on **Netlify** (the app, as one serverless function plus static files) with its data in
**Supabase** (Postgres). It costs nothing on the free plans. There is no always-on server, so
nothing runs between requests.

### One-time setup

1. **Supabase.** Create a project. Do not create tables by hand: the first deploy does.
2. **A user only Payday uses.** In Supabase's SQL editor, create a database user for the app, so it
   never runs as the all-powerful `postgres` user. Make up a long random password and put it where
   the placeholder is:

   ```sql
   create role payday_app with login password '<generate one>'
     nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 20;
   grant create on database postgres to payday_app;
   alter role payday_app set statement_timeout = '15s';
   alter role payday_app set idle_in_transaction_session_timeout = '30s';
   ```

   `create` on the database is what lets the build's migrations make the `payday` and `drizzle`
   schemas; the user owns what it creates, and nothing else. Through Supabase's poolers the user's
   name is `payday_app.<project ref>` (the project reference is in the project's URL and under
   Connect). Build the two connection strings from Connect, "Connection pooling", with that user name
   and the new password:
   - the **transaction pooler**, port **6543**, for the running app;
   - the **session pooler**, port **5432**, for the build's migrations.

3. **Netlify.** Add the repository as a site with **Base directory** `app` (this folder, which holds
   [`netlify.toml`](netlify.toml)) and **Production branch** `deploy`. Choose the same region for the
   functions as the one Supabase is in.
4. **Environment variables** in Netlify (Site configuration, Environment variables). They are never
   in the repository:

   | Variable                 | Value                                                                   |
   | ------------------------ | ----------------------------------------------------------------------- |
   | `DATABASE_URL`           | the transaction pooler address (port 6543), used by the running app     |
   | `DATABASE_MIGRATION_URL` | the session pooler address (port 5432), used by the build to migrate    |
   | `OWNER_SETUP_CODE`       | a long random code you make up, needed once to register the first owner |

   Both database addresses are used by **production deploys only**. A deploy preview or a branch
   build is stopped before it builds (`netlify.toml`), and `pnpm db:migrate` itself refuses to run on
   Netlify unless the deploy is a production one. The production build also refuses a `DATABASE_URL`
   that is not a `postgres://` address, rather than starting an empty local database.

5. **First sign-in.** Open the site, choose a password, and enter the setup code. Once an owner
   exists the code does nothing.

### Deploying

A deploy starts only when the `deploy` branch is pushed, so you choose when:

```sh
git push origin main:deploy
```

[CI](../.github/workflows/app.yml) runs the checks on every push and pull request but never
deploys. In Netlify, turn off branch deploys and deploy previews too; if one is started anyway,
`netlify.toml` stops it with "Payday deploys only from the deploy branch".

The build runs `pnpm build && pnpm db:migrate` (see [`netlify.toml`](netlify.toml)): the app is
built first, so a build that fails never leaves the database migrated ahead of the live code. If a
migration fails, the deploy fails and the previous version stays live. The running app never
migrates. Production runs **Node 24**, set by `NODE_VERSION` in `netlify.toml`.

**Credits.** Netlify's free plan gives 300 credits a month, and each production deploy costs 15, so
about 20 deploys a month. At the limit the site stops until the next month. Check Netlify's usage
page: past half by mid-month is the time to slow down. Batch changes into one deploy.

### When the app says it cannot reach the database

Supabase pauses a free project after about a week with no activity. The app then answers with a
503 page reading: "Payday can't reach its database right now. If nobody has used it for a week,
Supabase may have paused it: open the Supabase dashboard and press Restore, then try again." (and
`/health` answers 503). Open the project in Supabase's dashboard and press **Restore**; it comes back
in a few minutes with its data. Opening the app once a week avoids it. The message never shows the
database address.

### Backups

Supabase's free plan keeps no backups you can restore from. Download a full backup from
**Settings, Backup** now and then and keep the file: it restores the whole budget on this site or
a new one.

### What differs from development

- The calendar file is the only reminder. Download it once, and again when your pay schedule changes.
- Secrets live in Netlify, never in this repository.
- `/management`, the development dashboard, answers 404, and its code is never loaded in production.
