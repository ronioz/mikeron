import { Link, NavLink, Outlet } from "react-router";

import { ThemeMenu } from "./ThemeMenu";

export function Layout() {
  return (
    <>
      <header className="site-header app-header">
        <Link className="brand" to="/">
          Mikeronn
        </Link>
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/" end>
            Journal
          </NavLink>
          <NavLink to="/portfolio">Portfolio</NavLink>
          <NavLink to="/graphs">Graphs</NavLink>
        </nav>
        <div className="header-actions">
          {/* About the person rather than the trades: with the buttons, not among the pages. */}
          <NavLink className="account-link" to="/account" aria-label="Account" title="Account">
            <PersonIcon />
          </NavLink>
          <ThemeMenu />
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

/** Head and shoulders, drawn like the theme switch's icons. */
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.75" />
      <path d="M5 20a7 5 0 0 1 14 0" />
    </svg>
  );
}
