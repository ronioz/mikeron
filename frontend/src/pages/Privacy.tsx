import { type ReactNode } from "react";

import { api } from "../api";
import { useApi } from "../useApi";

/** When the policy last changed. Change it with the text. */
const CHANGED = "October 31, 2026";

/**
 * The privacy policy: what this site keeps, who else handles it and for how
 * long. Readable signed in or not. Who runs the site and how to reach them come
 * from the host's settings (OPERATOR_NAME, CONTACT_EMAIL), so the text names
 * nobody itself.
 */
export function Privacy() {
  const contact = useApi(api.privacyContact, []);
  const name = contact.data?.operator_name;
  const email = contact.data?.contact_email;
  const write: ReactNode = email ? (
    <>
      write to <a href={`mailto:${email}`}>{email}</a>
    </>
  ) : (
    "ask the person who invited you"
  );

  return (
    <>
      <title>Privacy · Mikeronn</title>
      <h1>Privacy</h1>
      <p className="lede">
        What Mikeronn keeps about you, who else handles it, and for how long. Last changed {CHANGED}.
      </p>
      <div className="policy">
        <section>
          <h2>Who runs Mikeronn</h2>
          <p>
            {name ? `Mikeronn is run by ${name}` : "Mikeronn is run by the person who runs this website"}
            , who decides what happens to the data described here. For anything about your data,{" "}
            {write}.
          </p>
        </section>

        <section>
          <h2>What it keeps</h2>
          <ul>
            <li>
              <strong>Your account:</strong> your email address, your password (as a hash, never as
              you typed it) and your plan.
            </li>
            <li>
              <strong>Your journal:</strong> the trades you add, with their figures, broker and the
              notes you write.
            </li>
            <li>
              <strong>Your sign-ins:</strong> for each browser or app you're signed in on, a hash of
              its key, which kind it is, and when it was last used.
            </li>
            <li>
              <strong>Codes:</strong> the 6-digit codes emailed to you, as hashes, until they're used,
              replaced by a newer one or your account is deleted.
            </li>
          </ul>
          <p>
            Pictures of trade reports are read on your own device. Only the words read from them are
            sent to Mikeronn, which uses them once to add the trade and doesn't keep them.
          </p>
          <p>
            Mikeronn doesn't ask for your name, phone number or bank logins, and has no ads,
            analytics or trackers.
          </p>
        </section>

        <section>
          <h2>What it's used for</h2>
          <p>
            Only to run your account and journal: signing you in, emailing your codes and working
            out your figures. Your data isn't sold or shared for advertising. To stop password
            guessing, wrong passwords and codes are counted by IP address, in the server's memory
            only.
          </p>
        </section>

        <section>
          <h2>Your browser</h2>
          <p>
            One cookie, called mikeronn_session, keeps you signed in. Your browser also remembers
            whether you chose the light or the dark look. Nothing else is stored there, and no other
            site is contacted: the fonts and the report reader's files come from Mikeronn itself.
          </p>
        </section>

        <section>
          <h2>Who else handles it</h2>
          <ul>
            <li>
              <strong>Render</strong> runs Mikeronn in Frankfurt, Germany. Its logs note each
              request (your IP address, the page or action, and the time) and problems such as an
              email that couldn't be sent.
            </li>
            <li>
              <strong>Cloudflare</strong> passes requests on to Render, so it sees your IP address
              too.
            </li>
            <li>
              <strong>Neon</strong> keeps the database, also in Frankfurt.
            </li>
            <li>
              <strong>Brevo</strong> sends the emails with your codes, so it gets your email address
              and those emails.
            </li>
            <li>
              <strong>Finnhub</strong> and <strong>Twelve Data</strong> are asked for share prices by
              ticker, such as AAPL, and never told who holds what.
            </li>
          </ul>
          <p>
            Render, Cloudflare and Neon are American companies, and Brevo is French. Each handles
            data under its own privacy terms.
          </p>
        </section>

        <section>
          <h2>How long it's kept</h2>
          <ul>
            <li>Your account and journal: until you delete them.</li>
            <li>A sign-in: until you sign out, or 90 days after it was last used.</li>
            <li>A code: it works for 15 minutes, or until five wrong tries.</li>
            <li>A sign-up whose address is never confirmed: 7 days.</li>
            <li>Render's logs: 7 days. Neon's copies for restoring the database: 6 hours.</li>
          </ul>
        </section>

        <section>
          <h2>Your choices</h2>
          <ul>
            <li>
              See and change your trades in the journal, and your plan and password on the Account
              page.
            </li>
            <li>
              Delete your account on the Account page. That removes your account, every trade and
              every sign-in at once.
            </li>
            <li>For a copy of your data, or anything else about it, {write}.</li>
          </ul>
          <p>
            If you think your data is being mishandled, you can also complain to your country's data
            protection authority.
          </p>
        </section>

        <section>
          <h2>How it's protected</h2>
          <p>
            Mikeronn is only served over HTTPS. Passwords are kept as Argon2id hashes, and sign-in
            keys and codes only as hashes, so the database never holds them as they are.
          </p>
        </section>

        <section>
          <h2>Children</h2>
          <p>Mikeronn isn't meant for anyone under 18.</p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>When this policy changes, so does the date at the top.</p>
        </section>
      </div>
    </>
  );
}
