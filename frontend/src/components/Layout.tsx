import { Link, NavLink, Outlet } from "react-router";

import { ThemeMenu } from "./ThemeMenu";

export function Layout() {
  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/">
          Mikeronn
        </Link>
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/" end>
            Journal
          </NavLink>
          <NavLink to="/portfolio">Portfolio</NavLink>
        </nav>
        <div className="header-actions">
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
