# mikeron

A personal trade journal. For every buy you record the ticker, price, number of
shares, date, why you bought, what you expect to happen, and the prices at which
you plan to sell (take profit / stop loss). The journal then shows what each
holding is worth now, and a portfolio page shows how your money is spread across
tickers.

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

- App: <http://localhost:8000>
- JSON API docs: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/healthz>

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

## Project layout

```
app/                   backend
  main.py              app setup, routing, serves the built frontend
  config.py            settings read from environment variables
  db.py                database engine and session
  models.py            the trades and quotes tables
  schemas.py           what the API accepts and returns
  crud.py              database queries
  prices.py            live prices: Finnhub client and the cache in front of it
  portfolio.py         the arithmetic: values, gains, positions, totals
  deps.py              login check, cross-site request check, trade lookup
  routers/
    trades.py          /api/trades
    portfolio.py       /api/summary and /api/portfolio
migrations/            Alembic migrations
frontend/              React + TypeScript app
  src/
    main.tsx           routes
    api.ts             every call to the backend
    types.ts           shapes of the API responses
    format.ts          money, percentages, dates
    chart.ts           which slices the portfolio ring shows, and their colours
    useApi.ts          loading data, with periodic refresh
    components/        layout, trade form, ring chart, stat tiles
    pages/             journal, portfolio, trade report, add / edit
    styles.css
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
