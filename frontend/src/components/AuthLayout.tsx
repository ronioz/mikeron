import { Link, Outlet } from "react-router";

import { ThemeMenu } from "./ThemeMenu";

/** Around the sign-in pages: the name and the theme switch, and nothing to navigate to yet. */
export function AuthLayout() {
  return (
    <>
      <header className="site-header auth-header">
        <Link className="brand" to="/sign-in">
          Mikeronn
        </Link>
        <div className="header-actions">
          <ThemeMenu />
        </div>
      </header>
      <main className="auth-page">
        <Outlet />
      </main>
    </>
  );
}
