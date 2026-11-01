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
- The Journal: the headline figure and the stats alone on the first screen, then
  one swipe to the time of the prices and each year's trades, which open when
  tapped.
- The Portfolio: all brokers or one at a time, with the same two steps: the
  headline figure and the stats first, then one swipe to the time of the prices,
  the ring and the holdings.
- Account: the email, the plan, and signing out.

Everything else is on the website for now, and the app links to it where it
matters: creating an account, resetting a password, changing the plan, deleting
an account, and the privacy page. Trades are added and edited there too, and the
Graphs page and the screenshot reader aren't in the app yet.

## Trying it

The app uses the hosted server, so sign in as you do on the website. The hosted
server sleeps when nobody's using it, so a first sign-in can take a minute. The
app says so while it waits.

### On a phone

No Android tools are needed for this.

1. Install **Expo Go** on the phone, from Google Play (or the App Store: an
   iPhone runs the app too).
2. On the computer, in this folder: `npm install`, then `npx expo start`.
3. Scan the QR code with Expo Go, or with the camera on an iPhone. The phone and
   the computer need to be on the same Wi-Fi.

To use another server, set `EXPO_PUBLIC_API_URL` when starting. A phone can't
reach `localhost`, so that needs the computer's address on the Wi-Fi.

### In a browser, with no phone

```sh
npm run preview
```

Then open <http://127.0.0.1:8090> and turn on the browser's phone view (open the
developer tools, then the device toolbar). Ctrl+C stops it.

This is a web build of the app, served from this computer, and it passes its
requests on to the server. `npx expo start --web` can't do that: a browser won't
let a page on `localhost` call another site, and the server refuses cross-site
requests, so it stops at the sign-in screen.

To see the copy on this computer instead, with the Docker app running:
`PREVIEW_SERVER=http://127.0.0.1:8000 npm run preview`.

It's quick for how the screens look and behave, but it isn't Android. Only a
phone or an emulator tries the protected storage, the keyboard, pulling down to
refresh, and how fonts and spacing come out on Android.

### On an Android emulator

This is real Android on the computer, and it needs Android Studio. Expo's guide
is at <https://docs.expo.dev/workflow/android-studio-emulator/>. The Java and
Watchman steps there can be skipped for Expo Go, as nothing gets compiled. With a
virtual device running, `npx expo start --android` opens the app on it.

## Checking a change

```sh
npm test              # every figure's formatting against the website's rules
npm run typecheck
npx expo-doctor
npx expo export --platform android   # builds the app's code, without a phone
```

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
