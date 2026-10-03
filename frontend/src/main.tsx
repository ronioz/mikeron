import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";

import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { NotFound } from "./pages/NotFound";
import { PortfolioPage } from "./pages/Portfolio";
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
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="trades/new" element={<TradeNew />} />
          <Route path="trades/:id" element={<TradeDetail />} />
          <Route path="trades/:id/edit" element={<TradeEdit />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
