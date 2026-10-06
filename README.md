# Mikeronn for iPhone

This branch is for the iPhone app. Nothing is built here yet.

The app gets no server and no database of its own. It talks to the same server
as the website, so a journal is the same on every device:

- The server and the website are on the `web-application` branch. The server is
  the only thing that reads or writes the database, and every figure is worked
  out there. The app shows what it is sent.
- Signing in uses the same `/api/auth` calls as the website, with
  `"client": "app"` in the body. The reply then carries a `token` instead of
  setting a cookie. The app keeps it in the Keychain and sends
  `Authorization: Bearer <token>` with every request.
- The server describes its API at `/openapi.json`, which Apple's
  swift-openapi-generator can turn into Swift code.
- A change the app needs from the server, such as a new figure, is made on
  `web-application`, never here. That keeps one description of the database.

"Adding the iPhone app later" in that branch's README has the rest: codes
instead of links in emails, deleting an account from inside the app, and what
to settle before a first release.
