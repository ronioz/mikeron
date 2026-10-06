import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";

import { AccountProvider, GuestOnly, RequireAccount } from "./account";
import { AuthLayout } from "./components/AuthLayout";
import { Layout } from "./components/Layout";
import { AccountPage } from "./pages/Account";
import { Dashboard } from "./pages/Dashboard";
import { GraphsPage } from "./pages/Graphs";
import { NotFound } from "./pages/NotFound";
import { PortfolioPage } from "./pages/Portfolio";
import { ResetPassword } from "./pages/ResetPassword";
import { SignIn } from "./pages/SignIn";
import { SignUp } from "./pages/SignUp";
import { TradeDetail } from "./pages/TradeDetail";
import { TradeEdit, TradeNew } from "./pages/TradeEditor";
// The fonts ship with the app rather than coming from a font service.
import "@fontsource-variable/instrument-sans/wght.css";
import "@fontsource/instrument-serif/400.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AccountProvider>
        <Routes>
          {/* Only for people who aren't signed in. */}
          <Route element={<GuestOnly />}>
            <Route element={<AuthLayout />}>
              <Route path="sign-in" element={<SignIn />} />
              <Route path="sign-up" element={<SignUp />} />
              <Route path="reset-password" element={<ResetPassword />} />
            </Route>
          </Route>
          {/* Everything else needs someone signed in. */}
          <Route element={<RequireAccount />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="portfolio" element={<PortfolioPage />} />
              <Route path="graphs" element={<GraphsPage />} />
              <Route path="trades/new" element={<TradeNew />} />
              <Route path="trades/:id" element={<TradeDetail />} />
              <Route path="trades/:id/edit" element={<TradeEdit />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </AccountProvider>
    </BrowserRouter>
  </StrictMode>,
);
