# Mikeron

A personal trade journal. For every buy you record the ticker, price, number of
shares, date, why you bought, what you expect to happen, and the prices at which
you plan to sell (take profit / stop loss). When you sell, you record the price,
shares and why you sold, and the journal works out what the sale gained or lost.
The journal shows what each holding is worth now, and a portfolio page shows how
your money is spread across tickers.

- **Backend:** FastAPI, SQLAlchemy and PostgreSQL, serving a JSON API under `/api`.
- **Frontend:** React and TypeScript, built with Vite, in `frontend/`.
- **Live prices:** Finnhub, cached in the database.

## Run it

```sh
docker compose up --build
```

Then open <http://localhost:8000>. The image builds the frontend, database
migrations run automatically on startup, and your data lives in the `pgdata`
Docker volume, so it survives restarts and rebuilds.

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
- **Invested** is what the shares you still hold cost, their fees included, and
  **Avg cost** is that per share. **Gain from sales** (often called realised
  gain) adds up what every sale gained or lost. The gain shown under **Portfolio
  value** is on the shares you still hold.
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

## Configuration

Copy `.env.example` to `.env` to change any of these.

| Variable | Default | Purpose |
| --- | --- | --- |
| `FINNHUB_API_KEY` | empty | Finnhub key. Empty turns live prices off |
| `PRICE_TTL_SECONDS` | `60` | How long a fetched price is reused |
| `MONTHLY_BUDGET` | `30` | Monthly amount shown on the dashboard |
| `APP_USERNAME` | `admin` | Login user name |
| `APP_PASSWORD` | empty | Login password. Empty disables the login prompt |
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
npm run typecheck   # in frontend/
uvx ruff check app migrations
```

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
  models.py            the trades and quotes tables
  schemas.py           what the API accepts and returns
  crud.py              database queries, and the check that every sale has the shares it needs
  ledger.py            which purchased shares each sale used (oldest first)
  cash.py              the cash sales leave, and which purchases reused it
  prices.py            live prices: Finnhub client and the cache in front of it
  portfolio.py         the arithmetic: values, gains, positions, totals
  deps.py              login check, cross-site request check, trade lookup
  routers/
    trades.py          /api/trades
    portfolio.py       /api/summary and /api/portfolio
migrations/            Alembic migrations
frontend/              React + TypeScript app
  src/
    main.tsx           routes, and the fonts (Instrument Serif and Instrument Sans,
                       bundled from npm so no font service is called)
    api.ts             every call to the backend
    types.ts           shapes of the API responses
    format.ts          money, percentages, dates
    cash.ts            how much of a purchase was paid with cash from sales
    deleteTrade.ts     asks before deleting a trade
    theme.ts           light or dark: the header switch, remembered per browser
    chart.ts           which slices the portfolio ring shows, and their colours
    useApi.ts          loading data, with periodic refresh
    components/        layout, trade form, ring chart, headline figure and stats,
                       the journal's tap-to-open trade lines for phones and
                       narrow windows
    pages/             journal, portfolio, trade report, add / edit
    styles.css         the look: colours and type for both themes, then layout
```

How the numbers flow: the backend does all the arithmetic with exact decimals
and sends amounts as strings. The frontend only formats them.

## Adding user accounts later

The app is single-user today, with one optional shared password. It is laid out
so that accounts, login and registration can be added without restructuring:

- **Backend:** every API route passes through `require_login` in `app/deps.py`.
  That is the one function to replace with one that identifies the signed-in
  user. Trades then need a `user_id` column (a migration), and the queries in
  `app/crud.py` filter by it. The price cache is keyed by ticker, so it can stay
  shared between users.
- **Frontend:** every request goes through `request()` in `frontend/src/api.ts`,
  the place to attach a session and to send people to a login page on a 401.
  New pages such as `/login` and `/register` are routes in `main.tsx`.

## Hosting

The image listens on `$PORT` (default 8000) and only needs `DATABASE_URL`, so it
runs on a VPS with `docker compose up -d` or on any container host with a managed
Postgres. Before putting it on the public internet:

- Set `APP_PASSWORD`, and change `POSTGRES_PASSWORD` from the default.
- Serve it over HTTPS. The login uses HTTP Basic auth, which sends the password
  with every request. On a VPS, a reverse proxy such as Caddy on the same machine
  can provide HTTPS and forward to `127.0.0.1:8000`, so `BIND_ADDRESS` can stay
  at its default.
