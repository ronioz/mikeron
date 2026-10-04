import { useLocation, useParams, useSearchParams } from "react-router";

import { api } from "../api";
import { Loadable } from "../components/Loadable";
import { TradeForm } from "../components/TradeForm";
import { today, trimZeros } from "../format";
import type { Trade, TradeInput } from "../types";
import { useApi } from "../useApi";

function toInput(trade: Trade): TradeInput {
  return {
    side: trade.side,
    ticker: trade.ticker,
    price: trimZeros(trade.price),
    shares: trimZeros(trade.shares),
    trade_date: trade.trade_date,
    thesis: trade.thesis,
    forecast: trade.forecast,
    take_profit: trade.take_profit === null ? "" : trimZeros(trade.take_profit),
    stop_loss: trade.stop_loss === null ? "" : trimZeros(trade.stop_loss),
    paid_from_cash: trade.paid_from_cash,
    // A trade without a fee shows an empty field, like the other optional ones.
    fee: Number(trade.fee) === 0 ? "" : trimZeros(trade.fee),
  };
}

/** /trades/new, or /trades/new?side=sell&ticker=AAPL to start a sale of a holding. */
export function TradeNew() {
  const [params] = useSearchParams();
  // Only used to help fill in the form (what is held, how much cash there is),
  // so the form doesn't wait for it.
  const portfolio = useApi(api.getPortfolio, []);
  const blank: TradeInput = {
    side: params.get("side") === "sell" ? "sell" : "buy",
    ticker: params.get("ticker") ?? "",
    price: "",
    shares: "",
    trade_date: today(),
    thesis: "",
    forecast: "",
    take_profit: "",
    stop_loss: "",
    paid_from_cash: false,
    fee: "",
  };
  return (
    <>
      <title>Add trade · Mikeronn</title>
      <TradeForm
        // Start over when the link changes, e.g. "Add trade" clicked while selling.
        key={params.toString()}
        heading="Add trade"
        initial={blank}
        cancelTo="/"
        holdings={portfolio.data?.positions}
        cash={portfolio.data?.cash}
        save={api.createTrade}
      />
    </>
  );
}

export function TradeEdit() {
  const id = Number(useParams().id);
  // Set by links that want the editor to return to them, such as the journal's Edit.
  const from = (useLocation().state as { from?: string } | null)?.from;
  const state = useApi(() => api.getTrade(id), [id]);
  return (
    <Loadable state={state}>
      {(trade) => {
        const what = trade.side === "sell" ? "sale" : "purchase";
        return (
          <>
            <title>{`Edit ${trade.ticker} ${what} · Mikeronn`}</title>
            <TradeForm
              heading={`Edit ${trade.ticker} ${what}`}
              initial={toInput(trade)}
              cancelTo={from ?? `/trades/${trade.id}`}
              returnTo={from}
              save={(input) => api.updateTrade(trade.id, input)}
            />
          </>
        );
      }}
    </Loadable>
  );
}
