import { Link, NavLink, Outlet } from "react-router";

export function Layout() {
  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/">
          Trade Journal
        </Link>
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/" end>
            Journal
          </NavLink>
          <NavLink to="/portfolio">Portfolio</NavLink>
        </nav>
        <Link className="button" to="/trades/new">
          Add trade
        </Link>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
