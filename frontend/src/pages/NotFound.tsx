import { Link } from "react-router";

export function NotFound() {
  return (
    <section className="empty">
      <title>Page not found · Trade Journal</title>
      <p>That page doesn't exist.</p>
      <Link className="button" to="/">
        Back to the journal
      </Link>
    </section>
  );
}
