# Mikeronn

A personal trade journal. For every buy you record the ticker, price, number of
shares, date, the broker you placed it with, why you bought, what you expect to
happen, and the prices at which you plan to sell (take profit / stop loss). When
you sell, you record the price, shares and why you sold, and the journal works
out what the sale gained or lost. The journal shows what each holding is worth
now, a portfolio page shows how your money is spread across tickers, and a
graphs page draws what everything you held was worth over time.

Everyone signs in with their own account and sees only their own journal.

- **Backend:** FastAPI, SQLAlchemy and PostgreSQL, serving a JSON API under `/api`.
- **Frontend:** React and TypeScript, built with Vite, in `frontend/`.
- **Live prices:** Finnhub, cached in the database.
- **Closing prices for the graphs:** Twelve Data, kept in the database.
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
  The reason is optional, for a purchase as for a sale.
- **Sell** next to each holding on the Portfolio page, and on the page of a
  purchase you still hold, opens that form ready to sell the ticker. It shows how
  many shares you hold, and **Sell all** fills them in, so fractional amounts
  such as 0.13304 never have to be typed by hand.
- **Add from screenshots** on that form adds trades with nothing to fill in,
  from screenshots of the report your bank's app shows for a finished trade,
  one trade to a picture. Choose one picture or several, up to 30 at a time
  (on a computer you can also paste them, or drop them on the page), and each
  trade is saved at once, with its ticker, date, price, shares, broker and
  whether it was a buy or a sale. Every picture then gets a line of its own
  beside a small copy of it: **Trade has been successfully added**, with a
  link to the trade, or why it wasn't, which leaves the journal as it was. One
  that can't be added doesn't hold up the rest. The fee, which the reports
  don't show, is worked out from the bank's tariff. Nor do they show what paid
  for a purchase, so it is saved as new money, and where a sale had left cash
  by its date, its line has a **New money / Cash from sales** switch that
  saves as you tap it. Why you made the trade, a forecast and targets are left
  empty: add them with **Edit**. See
  [Reading a trade's report](#reading-a-trades-report).
- **Edit** and **Delete** are on every row of the journal and on each trade's
  page. Deleting asks first.
- **Cash from sales.** The money from a sale goes into **Cash**. A purchase's
  **Paid with** says whether it was new money (what your plan is about) or
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
  the broker of the one you recorded last. A sale uses the shares bought at its
  own broker first, and its form says how many that broker holds. Cash from
  sales is counted across brokers together. To add a broker, add it to
  `Broker` in `app/schemas.py` and to `BROKERS` in `frontend/src/brokers.ts`,
  with a colour in `styles.css`; the database needs no change.

How the numbers work:

- Shares are sold oldest first (first in, first out). Selling 12 shares when you
  bought 10 at $10 and then 5 at $20 uses all 10 of the first purchase and 2 of
  the second, so the sale's cost is $140. What it gained is the amount received
  minus that cost.
- A broker can only sell what is held with it, so a sale uses the shares bought
  at its own broker first, oldest first. Whether you hold enough is still asked
  of all brokers together: if the sale's own broker runs short, the sale goes on
  to the oldest shares elsewhere rather than being refused over a label.
- **Portfolio** has a switch once any trade names a broker: **All** brokers
  together, or one at a time (and **Other** for trades naming none). A broker's
  part shows what is left of the shares bought there, what they cost and are
  worth, and the sales and fees of the trades placed there, so the parts add up
  to the whole. Cash and the money you put in are only shown under All.
- A purchase that sales used up shows how many of its shares are left; once all
  are sold it shows "all sold".
- Gains are after fees. A purchase's fee is part of what its shares cost, shared
  out by share, so selling half of a purchase takes half of its fee into that
  sale's cost. A sale's own fee comes off what it brought in.
- **Put in** is your own money: every purchase with its fee, less what cash
  from sales paid for. The gain under **Portfolio value** compares everything
  you have now (your shares plus your cash) with it, so it covers both the
  shares you still hold and every sale.
- The holdings table lists each ticker with **Price now**, one share's live
  price, and **Value now**, what all your shares of it are worth at that price.
- A broker's part shows **Cost**: what the shares held there cost, fees
  included. It can come to more than Put in: when you reinvest a sale's gain,
  it becomes part of what the new shares cost, without any new money. **Gain
  from sales** (often called realised gain) adds up what every sale gained or
  lost.
- **Fees** shows every fee paid and what share of the money you traded that is.
  On small purchases it adds up: a $1.50 fee on a $30 buy is 5%.
- **Portfolio value** is what the shares you hold are worth plus your **Cash**,
  the money from sales (after their fees) that no purchase has used yet. On the
  same day, sales come before purchases, so a purchase can reinvest that day's
  sale. A purchase paid from cash uses it for its fee too.
- **This week**, **This month** or **This quarter**, whichever your plan runs
  by, counts only new money against the plan's amount, fees included. Purchases
  paid with cash from sales are shown beside it as reinvested. Weeks run Monday
  to Sunday, months and quarters are the calendar's, and all three turn over
  at midnight UTC.
- A sale can't use more shares than you held on its date. The same check covers
  edits: the app refuses a change, such as deleting or shrinking a purchase, that
  would leave a later sale without enough shares, and says which sale is in the
  way.

Nothing about which shares a sale used, or how much cash a purchase reused, is
stored. Both are worked out from the trades each time (`app/ledger.py`,
`app/cash.py`), so edits and deletions can never leave them out of date.
Deleting a sale turns the purchases it paid for back into new money.

## Accounts

- **Creating an account** takes an email address, a password of at least 8
  characters and your plan: how much new money you mean to invest, and whether
  that is every week, month or quarter. Both parts of the plan have to be
  filled in, and nothing is suggested for them. A 6-digit code is emailed to
  the address; typing it in confirms the address and signs you in. An address
  that is never confirmed is forgotten after a week, so it can sign up again.
- **Signing in** keeps a browser signed in for 90 days after it was last used.
- **Forgot your password?** on the sign-in page emails a code for choosing a new
  one. Choosing it signs out every other device.
- **Account** in the header has your plan (the amount and how often, which the
  journal's "This month" or its weekly or quarterly twin compares with),
  changing your password, signing out (this device, or every other one) and
  deleting your account with every trade in it.

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

## Graphs

The Graphs page draws one line: what everything you held was worth at each
close, from your first trade on. On every day it counts the shares you held
that day at that day's closing prices, plus the cash from sales, so it is the
journal's "Portfolio value" looked back over time. A switch sets how far apart
the points are:

| Spacing | Each point is | Reaching back |
| --- | --- | --- |
| Daily | the value at a day's close | 3 months |
| Weekly | the value at the last close of a week | 2 years |
| Monthly | the value at the last close of a month | 10 years |
| Yearly | the value at the last close of a year | to your first trade |

The line rises when you buy as well as when prices do, so the headline compares
the latest value with the money you had put in by then, and pointing at any day
shows both.

Live prices can't draw this: Finnhub's free plan has no price history. The
closes come from Twelve Data instead. To turn the graph on:

1. Create a free account at <https://twelvedata.com> and copy the API key from
   the dashboard.
2. In `.env`, set `TWELVE_DATA_API_KEY`.
3. Run `docker compose up -d`.

Things to know:

- The free Twelve Data plan covers US-listed stocks and ETFs and allows 800
  requests a day, 8 a minute. It is for personal use, not for showing prices to
  the public.
- One request brings a ticker's daily closes for about twenty years, adjusted
  for share splits. They are kept in the database, and the weekly, monthly and
  yearly points are worked out from them.
- Closes are kept for every ticker in your journal, sold or not: one you sold
  was still part of the total while you held it.
- A ticker's closes are asked for again once a new one is final: at 17:00 in New
  York, an hour after US exchanges shut, Monday to Friday. That is one request
  per ticker per trading day, however often the page is opened.
- Before then the day going on is left out. Twelve Data lists it already, with
  the latest price where the close will be, and the graph shows closes only. A
  trade made today joins the graph with today's close.
- More than eight tickers can't all be fetched within one minute: the rest are
  asked for a minute later, the next time the page is opened.
- A ticker Twelve Data doesn't know is counted at what you paid for it, and the
  page says so. If Twelve Data can't be reached, the closes fetched earlier
  stay in use.

## Reading a trade's report

**Add from screenshots** on the Add trade form works in two steps, and neither
uses an AI service or costs anything:

1. **Each picture is turned into words on your own device**, by a text
   recognition engine (tesseract.js) running in the browser. The pictures are
   sent nowhere. The engine's files come from this app, not from a public CDN.
   They are fetched the first time a picture is read: about 6 MB, which the
   browser then keeps. A report takes a second or two, and several are read
   one after another.
2. **The words, and where each one sat, go to the server**
   (`POST /api/reports/add`, all the pictures' in one request), which puts
   them back into rows, picks each trade out with regular expressions
   (`app/reports.py`) and saves it. The words themselves aren't kept.

**Several pictures are added oldest trade first**, and a day's purchases
before its sales, whatever order they were chosen in. So a sale finds the
shares bought in another of the pictures, and a fee that depends on what you
hold counts the trades before it. Each trade is saved by itself: one that
can't be added changes nothing for the others. The answers come back in the
order the pictures were chosen, a trade or a reason for each.

It reads the page each bank's app shows for a finished trade, with the app set
to Georgian. Take the screenshot with every line of the page in view.

| | Bank of Georgia | TBC Bank |
| --- | --- | --- |
| Laid out as | each name with its figure under it | each name with its figure beside it |
| Buy or sale | an English sentence in the comment: "Buy 0.5 shares of KO at 61.2345 FULL fill" | a row of its own, and a + or − on the amount |
| Price | to four decimals in that sentence, to the cent in its row | to the cent |
| Date | "03 აგვ, 2026" | "2026, 14 აგვისტო, 11:20:45" |
| Fee | not shown | not shown |

Neither report names its bank: each is known by a row the other doesn't have,
and the trade's broker is set from that.

**Neither shows the fee** either: the bank books it as a transaction of its
own. So the trade's fee is worked out from the bank's tariff (`app/fees.py`,
written up in `docs/bank_and_brokerage_commissions.md`), and the page says so
beside the trade, for you to check against what the bank took:

- **Bank of Georgia:** nothing while the shares you hold there are worth
  $1,000 or less; above that, 0.3% of the trade, no less than $0.50 and no more
  than $40. What you hold is taken from your journal: the trades at Bank of
  Georgia up to the report's day, at live prices, or at what they cost where
  there is no live price.
- **TBC Bank:** nothing. Its app charges no fee for a trade.

A tariff changes: when one does, change it in `app/fees.py` and in that
document.

**Nobody looks the figures over before a trade is saved, so it is only saved
when its report can be trusted.** Otherwise that trade isn't added, and its
line on the page says which of these it was:

- The picture shows no trade.
- Something a trade needs can't be read: whether it was a buy or a sale, the
  date, the price, the shares, or the amount they are checked against.
- The price times the shares doesn't come to the amount, so a figure was
  misread.
- The trade is already in your journal: the same kind, ticker, day and shares,
  at a price within a cent. That catches a screenshot chosen twice, and a trade
  you typed in earlier. If you really made the same trade twice in a day, type
  the second one in.
- It is a sale of more shares than your journal held that day, counting the
  purchases in the other pictures chosen with it.
- The picture can't be opened at all. That one is said by the page itself.

Reading a picture exactly is the hard part, and three things make up for the
engine's mistakes:

- **A dark picture is turned into its negative first.** An app in its dark
  colours shows light writing on a dark ground, which the engine misreads far
  more often.
- **The picture is read twice.** Knowing Georgian and English together, the
  engine gets the Georgian right but now and then spoils a Latin letter or a
  digit: a "$" comes out as "%", a 5 as a 6. Knowing English only, it gets no
  Georgian and is better with figures, though it can lose a decimal point. So
  names and months come from the first reading, and each figure is taken from
  both, as two guesses, matched up by where they sat in the picture.
- **The amount settles which guess is right.** The price times the shares has
  to come to the amount the report shows. The first guesses that do are used;
  if none do, the trade isn't added.

Things to know:

- Dates are read day first (06.10.2026 is 6 October), as Georgia writes them,
  and the day is the one the report shows.
- What a report can't tell is saved as the form starts it: paid with new
  money, and no reason, forecast or targets. **Edit** changes any of it.
- **What paid for a purchase is chosen on its line**, once it is added, where
  there was cash from sales on its date (`PATCH /api/trades/{id}`, which
  changes that and nothing else). The line says what choosing cash comes to
  before you choose it. Cash pays what there was of it and the rest is new
  money: with $30 of cash, a $50 purchase is $30 from sales and $20 of new
  money, which counts against your plan. Cash is spent once, the oldest
  purchase first, so choosing it for one purchase can leave less for a later
  one. Their lines follow, and a switch stays even when no cash is left for it.
- A page left open while the app was updated can't load the reader: the page
  says to reload.
- When a bank changes its report, the rules need changing, not the engine. Add
  a made-up report shaped like the new one to `tests/test_reports.py` (never a
  real one: it shows a real person's money), then change the rules until it is
  read.

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
| `TWELVE_DATA_API_KEY` | empty | Twelve Data key. Empty turns the graph off |
| `SIGN_UP_OPEN` | `true` | Whether new accounts can be created |
| `SESSION_DAYS` | `90` | How long a device stays signed in after it was last used |
| `MAIL_BACKEND` | `log` | `log` writes emails to the server log; `smtp` sends them |
| `SMTP_HOST` / `SMTP_PORT` | empty / `465` | Mail server. Port 465 is encrypted from the start; others use STARTTLS |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | empty | Mail server login (for Resend: `resend` and the API key) |
| `MAIL_FROM` | empty | Who emails come from, such as `Mikeronn <codes@example.com>` |
| `FORWARDED_ALLOW_IPS` | `127.0.0.1` | Proxies whose `X-Forwarded-*` headers uvicorn trusts (see Hosting) |
| `CLIENT_IP_HEADER` | empty | A header in which the host gives the visitor's address and that visitors can't send, such as `CF-Connecting-IP` (see Hosting) |
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
no account can see or touch another's trades, deleting an account, plans and
the period the journal counts against them, which shares a sale uses and the
portfolio broker by broker, and the upgrades of a journal from before accounts
and from before plans had a period. They make their own databases
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
  models.py            the tables: users, sessions, emailed codes, trades, quotes,
                       closes
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
  closes.py            closing prices: Twelve Data client and the cache in front of it
  reports.py           reading a broker's trade report: the rules that find the
                       trade in the words of a screenshot
  fees.py              what each bank charges for a trade, by its tariff
  portfolio.py         the arithmetic: values, gains, positions, totals
  graphs.py            the arithmetic: what was held and what it was worth at each
                       close, a point per day, week, month and year
  deps.py              who is signed in, cross-site request check, trade lookup
  routers/
    auth.py            /api/auth: sign up, confirm, sign in and out, reset
    account.py         /api/me: the signed-in account
    trades.py          /api/trades
    portfolio.py       /api/summary, /api/portfolio and /api/graphs
    reports.py         /api/reports/add: the words of reports in, their trades
                       saved, and an answer for each
migrations/            Alembic migrations
tests/                 pytest: accounts, plans, brokers, graphs, reading reports,
                       the banks' fees, cash from sales, isolation between
                       accounts, the upgrades
frontend/              React + TypeScript app
  src/
    main.tsx           routes, and the fonts (Instrument Serif and Instrument Sans,
                       bundled from npm so no font service is called)
    account.tsx        who is signed in, and which pages need someone to be
    api.ts             every call to the backend
    types.ts           shapes of the API responses
    brokers.ts         the brokers a trade can name
    plan.ts            how often a plan's amount is put in: weekly, monthly, quarterly
    format.ts          money, percentages, dates
    cash.ts            how much of a purchase was paid with cash from sales
    ocr.ts             finds the words in a screenshot, on the device, reading it twice
    deleteTrade.ts     asks before deleting a trade
    theme.ts           light or dark: the header switch, remembered per browser
    chart.ts           which slices the portfolio ring shows, and their colours
    graphs.ts          the graph's spacings, and the amounts and dates along its edges
    useApi.ts          loading data, with periodic refresh
    components/        layouts, trade form, the button that adds trades from
                       screenshots, broker tags, the emailed-code step,
                       the plan's two fields, ring chart, the line of the
                       portfolio's value, headline figure and stats, the journal's
                       tap-to-open trade lines for phones and narrow windows
    pages/             journal, portfolio, graphs, trade report, add / edit,
                       sign in, create an account, reset a password, account
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
- Opening sign-up to the public also needs a privacy policy, and price plans
  that allow it: the free plans of Finnhub (live prices) and Twelve Data
  (closing prices) are for personal use.

### A free test deploy on Render and Neon

`render.yaml` describes the app for [Render](https://render.com), whose free plan
builds and runs it from this repository with no card. The database goes on
[Neon](https://neon.com)'s free plan, since Render's free Postgres is deleted
after 30 days.

1. On Neon, create a project in AWS Europe Central 1 (Frankfurt, next to the app)
   with Postgres 17, as in `docker-compose.yml`. Under Connect, turn off
   connection pooling and copy the connection string.
2. On Render, sign in with GitHub, choose New → Blueprint and pick this
   repository and its `web-application` branch. Paste the connection string as
   `DATABASE_URL`, your Finnhub key as `FINNHUB_API_KEY` and your Twelve Data
   key as `TWELVE_DATA_API_KEY`, then deploy.
3. When it's live, open the `onrender.com` address Render shows and create an
   account. The code is in the service's Logs tab.

Every push to `web-application` deploys again, and the new version applies any
migrations as it starts. Things to know:

- Emails aren't sent, so only whoever can read the Logs tab can finish a
  sign-up. For a private beta that is the invitation: a friend signs up, you
  read their code in the log and pass it on. A code works for 15 minutes.

- It starts with an empty database. The journal on your computer stays there;
  moving it is a dump and restore (see [Backups](#backups)).
- The app sleeps after 15 minutes without visits, and the next visit takes about
  a minute to wake it. Neon's database sleeps after 5 minutes and wakes in under
  a second.
- Render's free plan blocks the usual mail ports (25, 465 and 587). Resend also
  listens on 2587: set `MAIL_BACKEND=smtp`, `SMTP_PORT=2587` and the rest of
  [Email](#email) in the service's Environment tab.
- `FORWARDED_ALLOW_IPS=*` makes the app believe Render's proxy that the page
  came over HTTPS. The visitor's address is not taken from `X-Forwarded-For`,
  though: Render only adds to what a visitor sent in it, so anyone could name
  another address and get around the limits on wrong passwords (tried on the
  live site: it worked). Render stands behind Cloudflare, which gives the
  address in `CF-Connecting-IP` and refuses requests that bring that header
  themselves, so `render.yaml` sets `CLIENT_IP_HEADER=CF-Connecting-IP`. On
  another host, name its own such header, or leave it empty.
