# Mikeronn for Android

The Android app, in TypeScript with [Expo](https://docs.expo.dev) (React Native).

The app gets no server and no database of its own. It talks to the same server
as the website, so a journal is the same on every device:

- The server and the website are on the `web-application` branch. The server is
  the only thing that reads or writes the database, and every figure is worked
  out there. The app shows what it is sent.
- Signing in uses the same `/api/auth` calls as the website, with
  `"client": "app"` in the body. The reply then carries a `token` instead of
  setting a cookie. The app keeps it in the phone's protected storage and sends
  `Authorization: Bearer <token>` with every request.
- A change the app needs from the server, such as a new figure, is made on
  `web-application`, never here. That keeps one description of the database.

## What's here so far

- Signing in, with the emailed code for an address not confirmed yet.
- The Journal: the headline figure, the stats, and each year's trades, which
  open when tapped.
- The Portfolio: all brokers or one at a time, the ring and the holdings.
- Account: the email, the plan, and signing out.

Everything else is on the website for now, and the app links to it where it
matters: creating an account, resetting a password, changing the plan, deleting
an account, and the privacy page. Trades are added and edited there too, and the
Graphs page and the screenshot reader aren't in the app yet.

## Trying it on a phone

No Android tools are needed for this.

1. Install **Expo Go** from Google Play on the phone.
2. On the computer, in this folder: `npm install`, then `npx expo start`.
3. Scan the QR code with Expo Go. The phone and the computer need to be on the
   same Wi-Fi.

The app uses the hosted server, so sign in as you do on the website. To use
another, such as one on your computer, set `EXPO_PUBLIC_API_URL` when starting.
The hosted server sleeps when nobody's using it, so a first sign-in can take a
minute. The app says so while it waits.

## Checking a change

```sh
npm test              # every figure's formatting against the website's rules
npm run typecheck
npx expo-doctor
npx expo export --platform android   # builds the app's code, without a phone
```

`npm run web` shows the app in a browser, which is quick for layout. It isn't a
phone, though: only there does the sign-in key use the protected storage. See
`src/lib/token.ts` and `src/lib/token.web.ts`.

## How it's laid out

- `src/app/`: the screens. Each file is one, and `_layout.tsx` files say how they
  fit together. `(tabs)/` holds the tabs along the bottom.
- `src/components/`: what the screens are built from.
- `src/lib/`: the API client, the session, the theme, and figures' formatting.
  `types.ts`, `cash.ts`, `plan.ts` and `brokers.ts` are copies of the website's
  files (`frontend/src/` on `web-application`): the branches share no code, so a
  change to one of those means changing both.

The colours and fonts are the website's. The serif goes on the name alone, and
green and red on money alone.

## Handing it to friends

Not set up yet. Expo Go is for trying it; a real install needs an APK or a build
on Google Play, which Expo's cloud service makes without Android tools on the
computer (`npx eas-cli build`). Mikeronn stays private, so it wouldn't be
published: Play's internal testing takes up to 100 people for a one-time $25
developer fee, or Google's free limited account covers up to 20 devices.

"Adding the phone apps later" in the README on `web-application` covers what the
server already does for a phone app.
