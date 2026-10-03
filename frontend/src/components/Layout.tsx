import { Link, NavLink, Outlet } from "react-router";

import { ThemeToggle } from "./ThemeToggle";

export function Layout() {
  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/">
          <Logo />
          Mikeron
        </Link>
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/" end>
            Journal
          </NavLink>
          <NavLink to="/portfolio">Portfolio</NavLink>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <Link className="button" to="/trades/new">
            Add trade
          </Link>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}

/** A rising line in a ring, drawn in the text colour. public/favicon.svg is the same mark, filled. */
function Logo() {
  return (
    <svg className="logo" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="13.25" />
      <path d="M7.5 17.5 12 13l3 3 5.5-5.5" />
    </svg>
  );
}
