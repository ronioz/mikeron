# Mikeronn

A personal trade journal. For every buy you record the ticker, price, number of
shares, date, the broker you placed it with, why you bought, what you expect to
happen, and the prices at which you plan to sell (take profit / stop loss). When
you sell, you record the price, shares and why you sold, and the journal works
out what the sale gained or lost. The journal shows what each holding is worth
now, and a portfolio page shows how your money is spread across tickers.

Everyone signs in with their own account and sees only their own journal.

- **Backend:** FastAPI, SQLAlchemy and PostgreSQL, serving a JSON API under `/api`.
- **Frontend:** React and TypeScript, built with Vite, in `frontend/`.
- **Live prices:** Finnhub, cached in the database.
- **Email:** sign-up and password-reset codes, sent over SMTP (Resend, for example),
  or written to the server log until that is set up.

## Run it

```sh
docker compose up --build
```

Then open <http://localhost:8000> and create an account. The image builds the
frontend, database migrations run automatically on startup, and your data lives
in the `pgdata` Docker volume, so it survives restarts and rebuilds. Until email
is set up (see [Email](#email)), the code that confirms your address is in the
server log: `docker compose logs web`.

The sun/moon button in the header switches between the light and dark theme.
Until you use it, the app follows your device's setting; after that it
remembers your choice in that browser.

- App: <http://localhost:8000>
- JSON API docs: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/healthz>

## Buying, selling and fixing mistakes

- **Add trade** opens a form with a Buy / Sell switch. A sale asks for the sell
  price, the shares sold and why you sold; it has no forecast or target prices.
- **Sell** next to each holding on the Portfolio page, and on the page of a
  purchase you still hold, opens that form ready to sell the ticker. It shows how
  many shares you hold, and **Sell all** fills them in, so fractional amounts
  such as 0.13304 never have to be typed by hand.
- **Edit** and **Delete** are on every row of the journal and on each trade's
  page. Deleting asks first.
- **Cash from sales.** The money from a sale goes into **Cash**. A purchase's
  **Paid with** says whether it was new money (what you put in each month) or
  **cash from sales** (reinvesting). Such a purchase uses the cash there is on
  its date; whatever the cash doesn't cover counts as new money. To record
  selling one stock to buy another, add the sale, then mark the purchases as
  paid with cash from sales.
- **Fee ($)** on every trade is the broker's commission, copied from your
  broker's statement; leave it empty when there was none. A purchase's fee is
  added to what it cost, a sale's comes off what it brought in, and the
  **Fees** figure on the Portfolio page adds them all up.
- **Broker** says where the trade was placed: TBC Bank or Bank of Georgia,
  shown as a small tag in the bank's colour, or Other. A new trade starts with
  the broker of the one you recorded last. It is a label only: shares, cash and
  gains are counted across brokers together. To add a broker, add it to
  `Broker` in `app/schemas.py` and to `BROKERS` in `frontend/src/brokers.ts`,
  with a colour in `styles.css`; the database needs no change.

How the numbers work:

- Shares are sold oldest first (first in, first out). Selling 12 shares when you
  bought 10 at $10 and then 5 at $20 uses all 10 of the first purchase and 2 of
  the second, so the sale's cost is $140. What it gained is the amount received
  minus that cost.
- A purchase that sales used up shows how many of its shares are left; once all
  are sold it shows "all sold".
- Gains are after fees. A purchase's fee is part of what its shares cost, shared
  out by share, so selling half of a purchase takes half of its fee into that
  sale's cost. A sale's own fee comes off what it brought in.
- **Put in** is your own money: every purchase with its fee, less what cash
  from sales paid for. The gain under **Portfolio value** compares everything
  you have now (your shares plus your cash) with it, so it covers both the
  shares you still hold and every sale.
- In the holdings table, **Cost** is what each holding's shares cost, fees
  included, and **Avg cost** is that per share. Added up, the costs can come to
  more than Put in: when you reinvest a sale's gain, it becomes part of what the
  new shares cost, without any new money. **Gain from sales** (often called
  realised gain) adds up what every sale gained or lost.
- **Fees** shows every fee paid and what share of the money you traded that is.
  On small purchases it adds up: a $1.50 fee on a $30 buy is 5%.
- **Portfolio value** is what the shares you hold are worth plus your **Cash**,
  the money from sales (after their fees) that no purchase has used yet. On the
  same day, sales come before purchases, so a purchase can reinvest that day's
  sale. A purchase paid from cash uses it for its fee too.
- **This month** counts only new money against your monthly plan, fees
  included. Purchases paid with cash from sales are shown beside it as
  reinvested.
- A sale can't use more shares than you held on its date. The same check covers
  edits: the app refuses a change, such as deleting or shrinking a purchase, that
  would leave a later sale without enough shares, and says which sale is in the
  way.

Nothing about which shares a sale used, or how much cash a purchase reused, is
stored. Both are worked out from the trades each time (`app/ledger.py`,
`app/cash.py`), so edits and deletions can never leave them out of date.
Deleting a sale turns the purchases it paid for back into new money.

## Accounts

- **Creating an account** takes an email address and a password of at least 8
  characters. A 6-digit code is emailed to the address; typing it in confirms
  the address and signs you in. An address that is never confirmed is forgotten
  after a week, so it can sign up again.
- **Signing in** keeps a browser signed in for 90 days after it was last used.
- **Forgot your password?** on the sign-in page emails a code for choosing a new
  one. Choosing it signs out every other device.
- **Account** in the header has your monthly plan (the amount the journal's
  "This month" compares with), changing your password, signing out (this
  device, or every other one) and deleting your account with every trade in it.

Each account sees, sells from and changes only its own trades: one person's
shares never cover another's sale, and someone else's trade is "not found".
Live prices are shared, since a price is the same for everyone.

Codes are sent at most once a minute and five times an hour to an address, and
wrong passwords and codes are limited too. No answer says whether an address has
an account: signing up and asking for a reset code get the same reply either
way.

`SIGN_UP_OPEN=false` stops new accounts; existing ones keep working. Whoever
runs the server can set any account's password from the command line:

```sh
docker compose exec web python -m app.manage set-password you@example.com
```

### Upgrading a journal from before accounts

The trades recorded before accounts existed need an owner. The database upgrade
asks for the owner's address and stops until it gets one, so stop the app, build
it, and run the upgrade yourself:

```sh
docker compose stop web
docker compose build web
docker compose run --rm web alembic -x owner_email=you@example.com upgrade head
docker compose up -d web
docker compose exec web python -m app.manage set-password you@example.com
```

The owner's address counts as confirmed; the last command chooses its password.

## Live prices

The app works without them: values and gains simply show a dash. To turn them on:

1. Create a free account at <https://finnhub.io> and copy the API key from the
   dashboard.
2. Copy `.env.example` to `.env` and set `FINNHUB_API_KEY`.
3. Run `docker compose up -d`.

Things to know:

- The free Finnhub plan covers US-listed stocks and ETFs and allows 60 requests
  a minute. It is for personal, non-commercial use.
- Each price is reused for `PRICE_TTL_SECONDS` (60 by default), so the app asks
  Finnhub at most once a minute per ticker however often you refresh.
- A ticker Finnhub doesn't know has no live price. It is counted at what you
  paid, and the page says so.
- If Finnhub can't be reached, the last known prices stay on screen with the
  time they were fetched.

## Email

With the default `MAIL_BACKEND=log`, emails aren't sent: each one, code
included, is written to the server log (`docker compose logs web`). That's
enough on your own computer. To send them, with [Resend](https://resend.com):

1. Create a free account (3,000 emails a month, at most 100 a day) and add your
   domain. Resend shows a few DNS records to add at your domain's registrar.
   Without a domain, Resend only delivers to your own account's address, which
   is enough to try it.
2. Create an API key.
3. In `.env`, set:

   ```sh
   MAIL_BACKEND=smtp
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_USERNAME=resend
   SMTP_PASSWORD=re_your_api_key
   MAIL_FROM=Mikeronn <codes@your-domain.com>
   ```

   Without a domain yet, use `MAIL_FROM=onboarding@resend.dev`.
4. Run `docker compose up -d`.

Any other provider with SMTP works the same way with its own settings. An email
that can't be sent is reported in the server log.

## Configuration

Copy `.env.example` to `.env` to change any of these.

| Variable | Default | Purpose |
| --- | --- | --- |
| `FINNHUB_API_KEY` | empty | Finnhub key. Empty turns live prices off |
| `PRICE_TTL_SECONDS` | `60` | How long a fetched price is reused |
| `SIGN_UP_OPEN` | `true` | Whether new accounts can be created |
| `SESSION_DAYS` | `90` | How long a device stays signed in after it was last used |
| `MAIL_BACKEND` | `log` | `log` writes emails to the server log; `smtp` sends them |
| `SMTP_HOST` / `SMTP_PORT` | empty / `465` | Mail server. Port 465 is encrypted from the start; others use STARTTLS |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | empty | Mail server login (for Resend: `resend` and the API key) |
| `MAIL_FROM` | empty | Who emails come from, such as `Mikeronn <codes@example.com>` |
| `FORWARDED_ALLOW_IPS` | `127.0.0.1` | Proxies whose `X-Forwarded-*` headers uvicorn trusts (see Hosting) |
| `BIND_ADDRESS` | `127.0.0.1` | Interface the app is published on. `0.0.0.0` allows other devices |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `trades` | Database credentials |
| `DATABASE_URL` | set by compose | Full connection URL, for hosts with managed Postgres |

## Development

Run the database in Docker, and the backend and frontend on your machine so both
reload as you edit. This needs [uv](https://docs.astral.sh/uv/) and Node.js 22.22
or newer.

```sh
docker compose stop web          # frees port 8000 if the full stack is running
docker compose up -d db          # database only
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

In a second terminal:

```sh
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite serves the frontend and forwards `/api` calls
to the backend on port 8000. The backend reads the same `.env` file, so a
`FINNHUB_API_KEY` set there works here too.

Checks:

```sh
uv run pytest       # needs the database container running
npm run typecheck   # in frontend/
uvx ruff check app migrations tests
```

The tests cover accounts: signing up, in and out, codes, password resets, that
no account can see or touch another's trades, deleting an account, and the
upgrade of a journal from before accounts. They make their own databases
(`mikeronn_test` and `mikeronn_migration_test`) on the database server and drop
them afterwards; they refuse to run against the real one. Prices come from a
stand-in and emails go to a list in memory, so nothing is sent anywhere.

### Changing the database schema

Edit `app/models.py`, then generate and apply a migration:

```sh
uv run alembic revision --autogenerate -m "describe the change"
uv run alembic upgrade head
```

Review the generated file in `migrations/versions/` before committing it.

### Backups

Your trades live in the `pgdata` Docker volume. The first command saves a copy.
The other three put a copy back, replacing everything in the database with it;
use the name of the file you want, and restarting `web` brings an older copy up
to date with any newer migrations.

```sh
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backups/trades-$(date +%F).sql
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""'
docker compose exec -T db sh -c 'psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/trades-2026-10-03.sql
docker compose restart web
```

The `backups/` folder is kept out of git, since the copies hold your trades.

## Project layout

```
app/                   backend
  main.py              app setup, routing, serves the built frontend
  config.py            settings read from environment variables
  db.py                database engine and session
  models.py            the tables: users, sessions, emailed codes, trades, quotes
  schemas.py           what the API accepts and returns
  crud.py              trade queries, each for one account, and the check that
                       every sale has the shares it needs
  accounts.py          accounts in the database: sign-ups, sessions, codes
  security.py          password hashing (Argon2), session tokens, codes
  limits.py            caps on sign-in, sign-up and code attempts
  mail.py              the emails, written to the log or sent over SMTP
  manage.py            command line: set an account's password
  ledger.py            which purchased shares each sale used (oldest first)
  cash.py              the cash sales leave, and which purchases reused it
  prices.py            live prices: Finnhub client and the cache in front of it
  portfolio.py         the arithmetic: values, gains, positions, totals
  deps.py              who is signed in, cross-site request check, trade lookup
  routers/
    auth.py            /api/auth: sign up, confirm, sign in and out, reset
    account.py         /api/me: the signed-in account
    trades.py          /api/trades
    portfolio.py       /api/summary and /api/portfolio
migrations/            Alembic migrations
tests/                 pytest: accounts, isolation between them, the upgrade
frontend/              React + TypeScript app
  src/
    main.tsx           routes, and the fonts (Instrument Serif and Instrument Sans,
                       bundled from npm so no font service is called)
    account.tsx        who is signed in, and which pages need someone to be
    api.ts             every call to the backend
    types.ts           shapes of the API responses
    brokers.ts         the brokers a trade can name
    format.ts          money, percentages, dates
    cash.ts            how much of a purchase was paid with cash from sales
    deleteTrade.ts     asks before deleting a trade
    theme.ts           light or dark: the header switch, remembered per browser
    chart.ts           which slices the portfolio ring shows, and their colours
    useApi.ts          loading data, with periodic refresh
    components/        layouts, trade form, broker tags, the emailed-code step,
                       ring chart, headline figure and stats, the journal's
                       tap-to-open trade lines for phones and narrow windows
    pages/             journal, portfolio, trade report, add / edit, sign in,
                       create an account, reset a password, account
    styles.css         the look: colours and type for both themes, then layout
```

How the numbers flow: the backend does all the arithmetic with exact decimals
and sends amounts as strings. The frontend only formats them.

## Adding the iPhone app later

The JSON API is ready for a native app, which would be a second client next to
the website, showing the figures the server works out:

- **Signing in:** the same `/api/auth` calls, with `"client": "app"` in the
  body. The reply then carries a `token` (and when it expires unless used)
  instead of setting a cookie. The app keeps it in the Keychain and sends
  `Authorization: Bearer <token>` with every request; signing out ends it.
- **Codes, not links,** in the emails, so the app needs no universal links:
  the person types the code, or iOS offers it from Mail.
- **Deleting an account** from inside the app, which the App Store requires of
  any app that creates accounts: `POST /api/me/delete`.
- **A typed client:** FastAPI describes the API at `/openapi.json`, which Apple's
  swift-openapi-generator can turn into Swift code.
- **Before the first release:** host the backend (an iPhone can't reach your
  computer's `localhost`), and keep the API's shapes stable from then on, or
  move it under `/api/v1`, since people don't update apps at once. Adding Sign
  in with Apple later means a column for Apple's user id, and revoking Apple's
  tokens when an account is deleted.

## Hosting

The image listens on `$PORT` (default 8000) and only needs `DATABASE_URL`, so it
runs on a VPS with `docker compose up -d` or on any container host with a managed
Postgres. Before putting it on the public internet:

- Change `POSTGRES_PASSWORD` from the default.
- Serve it over HTTPS, so passwords, codes and the session cookie are never sent
  unencrypted. On a VPS, a reverse proxy such as Caddy on the same machine can
  provide HTTPS and forward to `127.0.0.1:8000`, so `BIND_ADDRESS` can stay at
  its default. Then set `FORWARDED_ALLOW_IPS=*` (safe while only this machine
  can reach the app), so the app sees visitors' addresses for its limits and
  marks the cookie as HTTPS-only.
- Set up email (see [Email](#email)) with your domain, or nobody can confirm
  their address.
- Opening sign-up to the public also needs a privacy policy, and a live-price
  plan that allows it: Finnhub's free plan is for personal, non-commercial use.

### A free test deploy on Render and Neon

`render.yaml` describes the app for [Render](https://render.com), whose free plan
builds and runs it from this repository with no card. The database goes on
[Neon](https://neon.com)'s free plan, since Render's free Postgres is deleted
after 30 days.

1. On Neon, create a project in AWS Europe Central 1 (Frankfurt, next to the app)
   with Postgres 17, as in `docker-compose.yml`. Under Connect, turn off
   connection pooling and copy the connection string.
2. On Render, sign in with GitHub, choose New → Blueprint and pick this
   repository. Paste the connection string as `DATABASE_URL` and your Finnhub key
   as `FINNHUB_API_KEY`, then deploy.
3. When it's live, open the `onrender.com` address Render shows and create an
   account. The code is in the service's Logs tab.

Every push to `main` deploys again, and the new version applies any migrations
as it starts. Things to know:

- It starts with an empty database. The journal on your computer stays there;
  moving it is a dump and restore (see [Backups](#backups)).
- The app sleeps after 15 minutes without visits, and the next visit takes about
  a minute to wake it. Neon's database sleeps after 5 minutes and wakes in under
  a second.
- Render's free plan blocks the usual mail ports (25, 465 and 587). Resend also
  listens on 2587: set `MAIL_BACKEND=smtp`, `SMTP_PORT=2587` and the rest of
  [Email](#email) in the service's Environment tab.
- `FORWARDED_ALLOW_IPS=*` makes the app believe the visitor's address and HTTPS
  that Render's proxy reports. With `*`, the address is the first one in
  `X-Forwarded-For`, so before opening sign-up to the public, check that Render
  replaces any address a visitor puts there, or the sign-in limits can be dodged.
